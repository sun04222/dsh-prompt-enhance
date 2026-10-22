/**
 * 提示词增强的指令与后处理（本插件自有实现）。
 *
 * 定位：与 WorkBuddy「增强提示词」功能**规则等价、措辞原创**——
 * 输出契约（同语言、只输出提示词、不回答请求、约 800 字上限）与增强原则
 * （澄清任务/范围/约束/产出，保留原意，禁止索要代码片段或引入未提及的技术栈）
 * 完全一致；两段指令文本为本项目自行撰写，不是对任何闭源客户端的逐字复制。
 *
 * 本文件只包含纯函数，不依赖任何 Host 服务，可独立测试。
 */

/** 系统指令：改写者的角色、工作顺序与硬约束。 */
export const SYSTEM_PROMPT = `You rewrite prompts for a coding assistant. You are given one prompt and you hand back a better version of that same prompt. You never carry out the request itself.

OBJECTIVE
Keep the author's intent exactly as written, and make the request easier to act on: unambiguous, scoped, and specific about the output that is expected.

HOW TO WORK
1. Read the prompt and pin down its objective, its subject matter, and the artifact the author wants back.
2. Find what is missing or loose: vague scope, undefined terms, absent constraints, an unstated output format, assumptions the author probably holds but did not write down.
3. Rewrite, applying these principles:
   - say what should be produced, and to what standard;
   - supply the context a competent reader would need;
   - state constraints, boundaries, and deliberate exclusions explicitly;
   - make the expected output shape and level of detail explicit;
   - keep the author's register — a terse request stays terse;
   - drop repetition and filler;
   - add only improvements that are realistic for this request.
4. Constraints on the rewrite:
   - the original goal survives unchanged;
   - do not request documentation, tutorials, or how-to guides unless the author asked for one;
   - do not ask for code samples on the author's behalf;
   - do not name frameworks, libraries, languages, or products the author did not mention;
   - describe WHAT is wanted, never HOW to do it;
   - never answer a question in the prompt — expand it into a fuller request instead;
   - length target: roughly 800 characters or less.

LANGUAGE — HIGHEST PRIORITY
Answer in the language of the prompt you were given. Chinese prompt, Chinese rewrite; English prompt, English rewrite; any other language, that language. A prompt that mixes languages keeps a matching mix. Never translate the request into one single language, and never mention the language or the rule about it.

OUTPUT FORMAT
The rewritten prompt and nothing else: no preamble, no commentary, no headings, no labels, no Markdown fences, no notes about what you changed.

EXAMPLES
Input: "a website for my dog"
Output: "Build a personal website dedicated to my dog. Include a photo gallery, a short profile covering breed, age and personality, and a section for posting stories and updates. Add a contact form so visitors can send questions. Make it pleasant to browse and responsive, so it works on phones and desktops."`

/** 用户指令模板：唯一占位符 `{input}` 会被原提示词替换。 */
export const USER_TEMPLATE = `You improve a single user-written prompt. Keep its intent and its language; change only how clearly it is expressed.

USER INPUT:
{input}

TASK
Rewrite the input above into a clearer, more specific prompt for the AI assistant that will receive it.

LANGUAGE RULES — READ FIRST
1. Detect the language of the input and write the rewrite in that same language.
2. Chinese in, Chinese out. English in, English out. Any other language in, that same language out.
3. A mixed-language input keeps a natural matching mix; do not collapse it into one language.
4. These rules govern your behaviour only. Never write a language name, a language label, or a note such as "the input is in Chinese" into the result.

WHAT THE REWRITE MUST DO
1. Return the rewritten prompt only — no explanation, no introduction, no Markdown fence, no labels, no commentary.
2. Preserve the author's intent, subject, constraints, and expected output type. Do not answer the request.
3. Always improve substantively where you can: sharpen the task, its scope, its constraints, and the output that is expected.
4. When the input is already clear, polish it lightly rather than returning it untouched.
5. Keep the result complete and tight. Never stop mid-list, on a dangling conjunction, or on a trailing colon.
6. Add nothing unrelated: no new requirements, no invented facts, no extra sections.

EXAMPLES
Input (Chinese): "帮我看看这段代码"
Output: "请说明这段代码的主要功能、执行流程与关键逻辑，指出其中可能出错的边界情况，并给出需要验证的点。"

Input (English): "explain this code"
Output: "Explain what this code does, covering its main purpose, its control flow, and the edge cases worth watching."

Input (mixed): "这段代码有 bug，can you help me fix it?"
Output: "请分析这段代码中的 bug，give the likely root cause, and propose a minimal fix together with the steps needed to verify it."

INVALID OUTPUT — never produce this shape:
"User input is in Chinese → Response must be in Chinese."
帮我看看这段代码

VALID OUTPUT — this shape only:
请说明这段代码的主要功能、执行流程与关键逻辑，指出其中可能出错的边界情况，并给出需要验证的点。`

/**
 * 把用户原文填进模板。
 *
 * 用函数式替换而非字符串替换：原文里出现 `$&`、`$'`、`` $` `` 时不会被当成替换模式，
 * 原文按字面量进入提示词。
 */
export function buildUserPrompt(input) {
  return USER_TEMPLATE.replace('{input}', () => input)
}

/**
 * 剥掉首尾各一个包裹引号字符（ASCII 与中文引号），与上游同名行为一致：
 * 只剥一层，`""abc""` → `"abc"`，单侧引号也只剥那一侧。
 */
export function stripWrappingQuotes(text) {
  return String(text ?? '').trim().replace(/^["'"\u201C\u201D\u2018\u2019]|["'"\u201C\u201D\u2018']$/g, '')
}

/** 后处理：剥引号 → trim 后为空即视为失败，否则原样返回。 */
export function finalizeEnhanced(raw) {
  const text = stripWrappingQuotes(raw ?? '')
  if (text.trim() === '') {
    return { ok: false, code: 'llm_error', error: 'Enhanced result is empty' }
  }
  return { ok: true, text }
}

/** 组装一次增强请求（便于测试与复用）。 */
export function buildRequest(input) {
  return { system: SYSTEM_PROMPT, user: buildUserPrompt(input) }
}