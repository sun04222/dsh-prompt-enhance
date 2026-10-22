# Changelog

## 1.1.0

- Composer button in `conversation.input.right`: enhance / enhancing / restore-original / failed states, per-session reset, in-flight request cancelled on unmount.
- Host route `POST /prompt-enhance` for the button, sharing one pipeline with the tool; trust delegated to `connection.requestRejection` with fail-closed rejection.
- Rewritten instruction text: same rules as before (language matching, prompt-only output, no answering, ~800-character target), original wording; no verbatim third-party text.

## 1.0.0

- `enhance_prompt` tool: single non-agentic completion, result envelope `{ success, text, code?, error? }` with `empty_input` / `llm_unavailable` / `llm_error` / `unknown`.
- Post-processing: trim, strip one wrapping quote pair, empty result becomes `llm_error`.
- Optional `model` override (`model-id` or `provider/model-id`), falling back to plugin config and the current default model.
- Unit tests for the pure pipeline (`node test/prompt.test.mjs`).