# Third-party notices

## No third-party code or text is distributed here

Everything in this repository — the Host plugin, the client bundle, the instruction text in `prompt.js`, the locale strings and the icon — is original work released under the MIT license (see `LICENSE`).

## Provenance of the feature's behaviour

The feature this plugin provides is a re-implementation of a prompt-enhancement interaction that also exists in **WorkBuddy** (Tencent's desktop assistant), where it appears as a composer button and an `llm:enhancePrompt` handler. The behaviour was studied from the installed application in order to reproduce the same *contract*:

- input is the user's raw prompt; output is only the rewritten prompt;
- the rewrite must be in the same language as the input, and must never answer the request;
- the target length is roughly 800 characters;
- quotes wrapping the model's answer are stripped once, and an empty result is an error rather than a success;
- failures are reported as a code and a message rather than a thrown error.

What this repository does **not** contain is any text, code, asset or package taken from WorkBuddy or from any other proprietary product. The instruction text in `prompt.js` was written for this project; it implements the same rules with its own wording. The plugin shares no dependency with WorkBuddy and does not interact with it at runtime.

Because the rules are expressed in new words, model output can differ in style from the original application even though the contract is the same. That trade-off is deliberate.

## Runtime dependencies

None. The plugin imports nothing outside Node's standard library and the DeepSeek Harness services provided by the host at runtime, which are resolved by the host's module loader rather than installed as dependencies (see `README.md`, engineering notes).