#!/usr/bin/env node
/**
 * Publish this package to GitHub without a local git install.
 *
 * Uses the GitHub Git Data API (blob → tree → commit → ref) exactly like a push
 * would, plus repository metadata (description, topics) and an optional tag and
 * release, which is what a GitHub-sourced DSH plugin upgrade tracks.
 *
 * Auth: reads GH_TOKEN / GITHUB_TOKEN from the environment. With the GitHub CLI
 * installed and signed in, set it first (PowerShell):
 *
 *   $env:GH_TOKEN = & gh auth token
 *   node scripts/publish-github.mjs --repo owner/name --tag v1.1.0
 *
 * Options:
 *   --repo owner/name   required
 *   --dir <path>        package root to upload (default: this package root)
 *   --branch <name>     branch to update (default: main)
 *   --tag <name>        create this tag pointing at the new commit
 *   --release           also create a release for --tag
 *   --topics a,b,c      replace repository topics (default: dsh-plugin,…)
 *   --description "…"   repository description
 *   --dry-run           print what would be uploaded, change nothing
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const API = 'https://api.github.com'
const DEFAULT_TOPICS = ['dsh-plugin', 'deepseek-harness', 'dsh', 'prompt-engineering', 'composer']
const DEFAULT_DESCRIPTION =
  'Prompt enhancement for DeepSeek Harness: composer button + enhance_prompt tool'
const SKIP_DIRS = new Set(['node_modules', '.git', '.pnpm-store', 'dist'])
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db'])

function parseArgs(argv) {
  const out = { branch: 'main', release: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const value = argv[++i]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      return value
    }
    if (arg === '--repo') out.repo = next()
    else if (arg === '--dir') out.dir = next()
    else if (arg === '--branch') out.branch = next()
    else if (arg === '--tag') out.tag = next()
    else if (arg === '--topics') out.topics = next().split(',').map((t) => t.trim()).filter(Boolean)
    else if (arg === '--description') out.description = next()
    else if (arg === '--release') out.release = true
    else if (arg === '--dry-run') out.dryRun = true
    else throw new Error(`unknown option ${arg}`)
  }
  if (!out.repo || !out.repo.includes('/')) throw new Error('--repo owner/name is required')
  return out
}

function token() {
  const value = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (!value) {
    throw new Error(
      'no token: run  $env:GH_TOKEN = & gh auth token  before this script (or set GITHUB_TOKEN)',
    )
  }
  return value.trim()
}

async function api(method, path, body, { allow404 = false, allow409 = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token()}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'dsh-prompt-enhance-publisher',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (allow404 && response.status === 404) return undefined
  // A repository with no commits answers 409 "Git Repository is empty" for ref reads.
  if (allow409 && response.status === 409) return undefined
  const text = await response.text()
  const data = text === '' ? undefined : JSON.parse(text)
  if (!response.ok) {
    const detail = data && data.message ? data.message : response.statusText
    const errors = data && data.errors ? ` ${JSON.stringify(data.errors)}` : ''
    throw new Error(`${method} ${path} → ${response.status} ${detail}${errors}`)
  }
  return data
}

/** Collect package files, skipping VCS and dependency directories. */
async function collect(root) {
  const files = []
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await walk(join(dir, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      if (SKIP_FILES.has(entry.name)) continue
      const absolute = join(dir, entry.name)
      const path = relative(root, absolute).split(sep).join('/')
      files.push({ path, absolute })
    }
  }
  await walk(root)
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return files
}

/** utf-8 blobs keep the payload small; anything non-textual goes in as base64. */
async function makeBlob(repo, file) {
  const bytes = await readFile(file.absolute)
  const asText = bytes.toString('utf8')
  const isText = Buffer.from(asText, 'utf8').equals(bytes)
  return api('POST', `/repos/${repo}/git/blobs`, {
    content: isText ? asText : bytes.toString('base64'),
    encoding: isText ? 'utf-8' : 'base64',
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const [owner, name] = options.repo.split('/')
  const root = options.dir ? options.dir : join(dirname(fileURLToPath(import.meta.url)), '..')
  const topics = options.topics ?? DEFAULT_TOPICS
  const description = options.description ?? DEFAULT_DESCRIPTION

  await stat(root)
  const files = await collect(root)
  console.log(`package: ${root}`)
  console.log(`files:   ${files.length}`)
  for (const file of files) console.log(`  ${file.path}`)
  if (options.dryRun) {
    console.log('\ndry run: nothing was uploaded')
    return
  }

  const existing = await api('GET', `/repos/${owner}/${name}`, undefined, { allow404: true })
  if (existing === undefined) {
    console.log(`\ncreating public repository ${options.repo}`)
    await api('POST', '/user/repos', {
      name,
      description,
      private: false,
      has_issues: true,
      auto_init: false,
    })
    // A fresh repository needs a moment before Git Data is addressable.
    await new Promise((resolve) => setTimeout(resolve, 1500))
  } else {
    console.log(`\nrepository exists (default branch ${existing.default_branch ?? '—'})`)
  }

  const refPath = `/repos/${owner}/${name}/git/ref/heads/${options.branch}`
  let current = await api('GET', refPath, undefined, { allow404: true, allow409: true })

  if (current === undefined) {
    // The Git Data API refuses blobs while the repository has no commit at all
    // ("Git Repository is empty", 409). The Contents API does not: it seeds the
    // first commit and creates the branch, after which the tree below lands as a
    // second, ordinary commit.
    const seed = files.find((file) => file.path === 'README.md') ?? files[0]
    if (!seed) throw new Error('nothing to upload')
    console.log(`\nseeding the first commit with ${seed.path} (repository has no commits yet)`)
    await api('PUT', `/repos/${owner}/${name}/contents/${seed.path}`, {
      message: 'docs: add README',
      content: (await readFile(seed.absolute)).toString('base64'),
      branch: options.branch,
    })
    current = await api('GET', refPath, undefined, { allow404: true, allow409: true })
    if (current === undefined) throw new Error('branch was not created by the seed commit')
  }

  const parentSha = current?.object?.sha
  const baseTreeSha = parentSha
    ? (await api('GET', `/repos/${owner}/${name}/git/commits/${parentSha}`)).tree.sha
    : undefined
  console.log(parentSha ? `parent commit: ${parentSha}` : 'first commit on this branch')

  console.log('\nuploading blobs')
  const tree = []
  for (const file of files) {
    const blob = await makeBlob(options.repo, file)
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })
    console.log(`  ${file.path} → ${blob.sha.slice(0, 8)}`)
  }

  const treeResult = await api('POST', `/repos/${owner}/${name}/git/trees`, {
    tree,
    ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
  })
  const commit = await api('POST', `/repos/${owner}/${name}/git/commits`, {
    message: `chore: publish ${name} ${options.tag ?? ''}`.trim(),
    tree: treeResult.sha,
    parents: parentSha ? [parentSha] : [],
  })
  console.log(`\ncommit: ${commit.sha}`)

  if (parentSha) {
    await api('PATCH', `/repos/${owner}/${name}/git/refs/heads/${options.branch}`, {
      sha: commit.sha,
      force: false,
    })
  } else {
    await api('POST', `/repos/${owner}/${name}/git/refs`, {
      ref: `refs/heads/${options.branch}`,
      sha: commit.sha,
    })
  }
  console.log(`branch ${options.branch} → ${commit.sha}`)

  await api('PATCH', `/repos/${owner}/${name}`, {
    description,
    homepage: `https://github.com/${options.repo}#readme`,
  })
  await api('PUT', `/repos/${owner}/${name}/topics`, { names: topics })
  console.log(`topics: ${topics.join(', ')}`)

  if (options.tag) {
    const tagRef = `/repos/${owner}/${name}/git/ref/tags/${options.tag}`
    const existingTag = await api('GET', tagRef, undefined, { allow404: true })
    if (existingTag === undefined) {
      await api('POST', `/repos/${owner}/${name}/git/refs`, {
        ref: `refs/tags/${options.tag}`,
        sha: commit.sha,
      })
      console.log(`tag: ${options.tag}`)
    } else {
      console.log(`tag ${options.tag} already exists — left untouched`)
    }
    if (options.release) {
      await api('POST', `/repos/${owner}/${name}/releases`, {
        tag_name: options.tag,
        name: options.tag,
        body: 'See CHANGELOG.md.',
        draft: false,
        prerelease: false,
      })
      console.log(`release: ${options.tag}`)
    }
  }

  console.log(`\ndone → https://github.com/${options.repo}`)
}

main().catch((error) => {
  console.error(`\nfailed: ${error.message}`)
  process.exitCode = 1
})