import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SYSTEM_PROMPT,
  USER_TEMPLATE,
  buildRequest,
  buildUserPrompt,
  finalizeEnhanced,
  stripWrappingQuotes,
} from '../prompt.js'

test('buildUserPrompt 原样插入用户文本，并保留模板其余部分', () => {
  const input = '帮我写一个登录页面'
  const built = buildUserPrompt(input)
  assert.equal(built, USER_TEMPLATE.replace('{input}', () => input))
  assert.ok(built.includes(input))
  assert.ok(!built.includes('{input}'))
  // 模板的规则段必须完整保留
  assert.ok(built.includes('LANGUAGE RULES — READ FIRST'))
  assert.ok(built.includes('WHAT THE REWRITE MUST DO'))
})

test('buildUserPrompt 不解释替换模式，$& 等字符按字面量保留', () => {
  const input = 'keep $& and $\' and $` literal'
  const built = buildUserPrompt(input)
  assert.ok(built.includes(input))
})

test('buildUserPrompt 只在占位符处替换一次，模板其余 { } 不受影响', () => {
  const built = buildUserPrompt('x')
  assert.equal(built.split('USER INPUT:').length, 2)
  assert.ok(built.includes('"the input is in Chinese"'))
})

test('stripWrappingQuotes 剥掉首尾各一个包裹引号', () => {
  assert.equal(stripWrappingQuotes('"hello"'), 'hello')
  assert.equal(stripWrappingQuotes('“你好”'), '你好')
  assert.equal(stripWrappingQuotes("  'hello'  "), 'hello')
  assert.equal(stripWrappingQuotes('  plain text  '), 'plain text')
})

test('stripWrappingQuotes 单次剥引号，与 WorkBuddy 行为一致', () => {
  // 只剥一层：""abc"" -> "abc"
  assert.equal(stripWrappingQuotes('""abc""'), '"abc"')
  // 只有一侧有引号时也只剥那一侧
  assert.equal(stripWrappingQuotes('"abc'), 'abc')
})

test('finalizeEnhanced 对空结果回 llm_error', () => {
  assert.deepEqual(finalizeEnhanced(''), { ok: false, code: 'llm_error', error: 'Enhanced result is empty' })
  assert.deepEqual(finalizeEnhanced('   '), { ok: false, code: 'llm_error', error: 'Enhanced result is empty' })
  assert.deepEqual(finalizeEnhanced('""'), { ok: false, code: 'llm_error', error: 'Enhanced result is empty' })
})

test('finalizeEnhanced 成功时返回剥引号后的文本', () => {
  assert.deepEqual(finalizeEnhanced('“请解释这段代码的主要功能。”'), {
    ok: true,
    text: '请解释这段代码的主要功能。',
  })
})

test('系统提示词保留关键约束', () => {
  assert.ok(SYSTEM_PROMPT.includes('You rewrite prompts for a coding assistant'))
  assert.ok(SYSTEM_PROMPT.includes('LANGUAGE — HIGHEST PRIORITY'))
  assert.ok(SYSTEM_PROMPT.includes('roughly 800 characters or less'))
  assert.ok(SYSTEM_PROMPT.includes('no preamble, no commentary'))
  assert.ok(SYSTEM_PROMPT.includes('never answer a question in the prompt'))
  assert.ok(SYSTEM_PROMPT.includes('describe WHAT is wanted, never HOW to do it'))
})

test('用户模板保留关键约束', () => {
  assert.ok(USER_TEMPLATE.includes('Return the rewritten prompt only'))
  assert.ok(USER_TEMPLATE.includes('Do not answer the request'))
  assert.ok(USER_TEMPLATE.includes('Detect the language of the input'))
  assert.ok(USER_TEMPLATE.includes('{input}'))
})

test('buildRequest 同时给出系统提示词与填充后的用户提示词', () => {
  const { system, user } = buildRequest('写个周报')
  assert.equal(system, SYSTEM_PROMPT)
  assert.ok(user.includes('写个周报'))
})
