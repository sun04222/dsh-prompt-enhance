/**
 * dsh-prompt-enhance —— 提示词增强（对齐 WorkBuddy「增强提示词」）
 *
 * 行为契约与「逐字一致的提示词 + 后处理」见 ./prompt.js 与 ./README.md。
 * 本文件负责 Host 侧两件事：
 *   1. 注册工具 `enhance_prompt`（模型可调用）；
 *   2. 注册同源 HTTP 通道 `/prompt-enhance`，供输入框右侧「增强」按钮调用。
 *
 * 这里直接构造 ToolDefinition（不过 @deepseek-ai/dsh-tools 的 defineTool），
 * 因为本地目录安装的包解析不到该宿主包；`parameters` 给出的就是 defineTool
 * 归一化后的同一份原始 JSON Schema，因此模型看到的 schema 完全一致。
 */

import { SYSTEM_PROMPT, buildUserPrompt, finalizeEnhanced } from './prompt.js'

export const name = 'dsh-prompt-enhance'
export const inject = ['tools']

/** 补全墙钟上限（毫秒）；受工具自身 timeoutMs 兜底。 */
const DEFAULT_TIMEOUT_MS = 60_000
/** 工具级超时，始终大于补全超时，避免外层先杀掉再包装错误。 */
const TOOL_TIMEOUT_MS = 90_000
/** Web 通道路径（前端按钮同源 POST）。 */
const ROUTE_PATH = '/prompt-enhance'
/** 请求体上限（字符），防止误吞超大草稿。 */
const MAX_BODY_CHARS = 256 * 1024

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function readOptions(config) {
  const c = config && typeof config === 'object' ? config : {}
  const timeoutMs = Number(c.timeoutMs)
  return {
    provider: nonEmpty(c.provider),
    model: nonEmpty(c.model),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  }
}

/**
 * 解析实际路由：参数 > 插件配置 > 当前默认模型。
 * `model` 参数支持 `model-id` 或 `provider/model-id`（按第一个 `/` 切分）。
 */
function resolveRoute(ctx, options, argModel) {
  let provider = options.provider
  let model = options.model
  const override = nonEmpty(argModel)
  if (override) {
    const slash = override.indexOf('/')
    if (slash > 0) {
      provider = override.slice(0, slash)
      model = override.slice(slash + 1)
    } else {
      model = override
    }
  }
  if (!provider || !model) {
    const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
    provider = provider ?? nonEmpty(selection?.provider)
    model = model ?? nonEmpty(selection?.model)
  }
  if (!provider || !model) return undefined
  return { provider, model }
}

function failure(code, error) {
  return { success: false, text: '', code, error }
}

/** 抽出 assistant 文本：累加 `text-delta`，并捕获终止原因。 */
async function collectText(stream) {
  let text = ''
  let failureMessage
  let aborted = false
  for await (const chunk of stream) {
    if (!chunk || typeof chunk !== 'object') continue
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      text += chunk.text
      continue
    }
    if (chunk.type === 'finish') {
      const kind = chunk.reason?.kind
      if (kind === 'error') {
        failureMessage = chunk.reason?.failure?.message || 'LLM completion failed'
      } else if (kind === 'aborted') {
        aborted = true
        failureMessage = chunk.reason?.failure?.message || 'Request aborted'
      }
    }
  }
  return { text, failureMessage, aborted }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error ?? '')
}

/** 同源信任检查：委派官方 connection.requestRejection，缺席/抛错一律 fail-closed 403。 */
function rejectRequest(ctx, req) {
  try {
    const connection = ctx.get?.('connection')
    const reject = connection?.requestRejection
    if (typeof reject !== 'function') return 403
    return reject.call(connection, { headers: req.headers }) ?? undefined
  } catch {
    return 403
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    req.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_CHARS) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function createRouteHandler(ctx, options, enhance) {
  return (req, res) => {
    void (async () => {
      const rejection = rejectRequest(ctx, req)
      if (rejection !== undefined) {
        sendJson(res, rejection, { success: false, code: 'forbidden', error: 'request rejected' })
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' })
        res.end()
        return
      }
      let payload
      try {
        const raw = await readBody(req)
        payload = raw === '' ? {} : JSON.parse(raw)
      } catch (error) {
        sendJson(res, 400, { success: false, code: 'bad_request', error: messageOf(error) })
        return
      }
      const text = payload && typeof payload.text === 'string' ? payload.text : ''
      const model = payload && typeof payload.model === 'string' ? payload.model : undefined
      const envelope = await enhance(text, model, undefined)
      sendJson(res, 200, envelope)
    })().catch((error) => {
      if (!res.headersSent) {
        sendJson(res, 500, { success: false, code: 'unknown', error: messageOf(error) })
      } else {
        res.destroy()
      }
    })
  }
}

export function apply(ctx, config) {
  const options = readOptions(config)

  async function enhance(rawText, modelArg, signal) {
    const input = typeof rawText === 'string' ? rawText : ''
    // 空输入不发起模型调用（WorkBuddy 同款短路）。
    if (input.trim() === '') return failure('empty_input', 'Empty input')

    const llm = ctx.get('llm')
    if (!llm || typeof llm.stream !== 'function') {
      return failure('llm_unavailable', 'LLM service is not available')
    }

    const route = resolveRoute(ctx, options, modelArg)
    if (!route) {
      return failure('llm_unavailable', 'No model route is selected')
    }

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, options.timeoutMs)
    const forwardAbort = () => controller.abort()
    signal?.addEventListener('abort', forwardAbort, { once: true })

    try {
      const stream = llm.stream({
        provider: route.provider,
        model: route.model,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: [{ type: 'text', text: buildUserPrompt(input) }] },
        ],
        signal: controller.signal,
      })
      const { text, failureMessage, aborted } = await collectText(stream)
      if (failureMessage) {
        if (timedOut) return failure('llm_error', `Request timed out after ${options.timeoutMs}ms`)
        if (aborted) return failure('llm_error', failureMessage)
        return failure('llm_error', failureMessage)
      }
      const final = finalizeEnhanced(text)
      if (!final.ok) return failure(final.code, final.error)
      return { success: true, text: final.text }
    } catch (error) {
      if (timedOut) return failure('llm_error', `Request timed out after ${options.timeoutMs}ms`)
      if (controller.signal.aborted) return failure('llm_error', 'Request aborted')
      return failure('unknown', messageOf(error) || 'prompt enhancement failed')
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forwardAbort)
    }
  }

  ctx.tools.register({
    name: 'enhance_prompt',
    description:
      '把一段原始提示词改写为更清晰、更具体的提示词，并原样返回改写结果：保持输入语言，只产出提示词本身，不回答提示词里的请求。当用户要求增强/优化/润色提示词，或想把一句模糊需求整理成可直接发给模型的提示词时调用。',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description:
            '用户原始提示词，按用户写下的原样传入；不要预先改写，也不要用它代替本工具去回答原请求。空白输入直接返回 success=false（code=empty_input），不会调用模型。',
        },
        model: {
          type: 'string',
          description:
            '可选模型覆盖，写 `model-id` 或 `provider/model-id`；省略时依次使用插件配置与当前默认模型。',
        },
      },
      required: ['text'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', description: '是否得到可用的增强结果。' },
          text: { type: 'string', description: '成功时是增强后的提示词；失败时为空串。' },
          code: {
            type: 'string',
            description: '失败代码：empty_input | llm_unavailable | llm_error | unknown。',
          },
          error: { type: 'string', description: '失败原因（人类可读）。' },
        },
        required: ['success', 'text'],
      },
      render: (_args, value) => {
        if (value && value.success) return [{ type: 'text', text: value.text }]
        const code = value?.code ?? 'unknown'
        const detail = value?.error ?? 'prompt enhancement failed'
        return [{ type: 'text', text: `[${code}] ${detail}` }]
      },
      presentationMeta: (_args, value) => ({
        success: value?.success === true,
        chars: typeof value?.text === 'string' ? value.text.length : 0,
        ...(value?.code ? { code: value.code } : {}),
      }),
    },
    presentCall: () => ({ card: 'generic', title: '增强提示词', kind: 'other', content: [] }),
    presentResult: (_args, { isError, meta }) => ({
      card: 'generic',
      title: isError || meta?.success !== true ? '增强提示词 · 失败' : '增强提示词 · 已改写',
      content: [],
    }),
    timeoutMs: TOOL_TIMEOUT_MS,
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {}
      return enhance(input.text, input.model, exec?.signal)
    },
  })

  // 输入框按钮的同源通道；webServer 缺席（非 Web 宿主）时静默跳过。
  ctx.inject(['webServer'], (c) => {
    const server = c.webServer
    if (!server || typeof server.register !== 'function') return
    server.register({
      kind: 'exact',
      path: ROUTE_PATH,
      handler: createRouteHandler(ctx, options, enhance),
    })
  })
}
