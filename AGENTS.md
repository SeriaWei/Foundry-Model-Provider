# Foundry Model Provider — Project Guidelines

## Build and Test

```bash
npm run build          # Production bundle (minified)
npm run compile        # TypeScript compilation to out/
npm run watch          # Dev mode with file watching
npm run lint           # ESLint on src/
npm run pack           # Create .vsix package
```

- Always run `npm run build` before committing to verify no bundling errors.
- Use `npm run watch` during development for fast iteration.

## Architecture

This is a **VS Code extension** that registers Foundry LLM models as chat providers in GitHub Copilot Chat.

Key files:

| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension activation, registers provider & commands |
| `src/foundryProvider.ts` | `FoundryLanguageModelChatProvider` — main provider, model registration, response streaming |
| `src/foundryApiClient.ts` | API client routing to Responses API or Chat Completions API |
| `src/messageConverter.ts` | Converts VS Code messages ↔ OpenAI-compatible format |
| `src/provideToken.ts` | Token counting for messages/images/tools |
| `src/types.ts` | TypeScript interfaces and config types |
| `src/tokenizer/tokenizerManager.ts` | Singleton tokenizer using Microsoft's TikTokenizer |
| `src/tokenizer/imageUtils.ts` | Image dimension extraction for token estimation |
| `test-api.mjs` | Standalone script to test API connectivity |

Data flow: `Copilot Chat → VS Code LM API → FoundryProvider → FoundryApiClient (OpenAI SDK) → Foundry service`

Two API modes supported per model (configured in settings): `responses` (default) and `completions`.

## Conventions

- **Naming**: PascalCase for classes (`FoundryLanguageModelChatProvider`), camelCase for functions/variables, UPPER_SNAKE_CASE for constants.
- **Streaming**: Use async generators (`async function*`) for streaming responses. Handle both Responses API and Chat Completions API stream formats.
- **Error handling**: Wrap API errors via `mapToLanguageModelError()` to produce VS Code `LanguageModelError` types.
- **API keys**: Stored in VS Code secret storage — never hardcode or log.
- **Thinking models**: For reasoning models (o1, o3, o4), emit `vscode.LanguageModelChatMessageThinkingPart` from `provideLanguageModelResponse`.
- **Singleton pattern**: Used for `TokenizerManager` (`getInstance()`).

## Configuration

Models are defined via `foundry.models` in VS Code settings. Each entry specifies:

- `id`, `name`, `vendor`, `family` — model identity
- `apiType`: `"responses"` or `"completions"`
- Capability flags: `supportsImage`, `supportsTools`, `supportsThinking`, `thinkingTokenLimit`, `supportsStreaming`
- `maxInputTokens`, `maxOutputTokens`

Endpoint and API key are set separately (`foundry.endpoint`, `foundry.apiKey`).

Dependency notes: Uses `openai` SDK v6+ for API communication (chat-based, not `openai/edge`). Tokenizer data asset is at `assets/model/o200k_base.tiktoken`.