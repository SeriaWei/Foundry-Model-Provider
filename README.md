# Foundry Model Provider

A VS Code extension that provides Microsoft Foundry LLM models as chat model providers for GitHub Copilot Chat.

## Features

- Integrates Microsoft Foundry LLM models into VS Code's chat interface
- Supports streaming responses for real-time interaction
- Configurable models with customizable parameters
- Supports multimodal input (images) for compatible models
- Tool/function calling support
- Secure API key storage using VS Code's secret storage

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Configure the extension:
   - Open VS Code Settings
   - Set `foundryModelProvider.endpoint` to your Foundry API endpoint (e.g., `https://your-service.services.ai.azure.com/openai/v1`)
   - Run command "Foundry Model Provider: Set API Key" to securely store your API key

4. Configure models (optional):
   - Customize `foundryModelProvider.models` in settings to add/modify available models

## Configuration

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `foundryModelProvider.endpoint` | Microsoft Foundry API endpoint URL | `""` |
| `foundryModelProvider.models` | List of available models to register | See below |
| `foundryModelProvider.defaultParameters` | Default parameters for requests | `{ temperature: 0.7, topP: 1.0 }` |

### Model Configuration

Each model in `foundryModelProvider.models` can have:

```json
{
  "id": "gpt-4.1",
  "name": "GPT-4.1",
  "family": "gpt-4.1",
  "version": "2024-04-01",
  "maxInputTokens": 128000,
  "maxOutputTokens": 16384,
  "capabilities": {
    "imageInput": true,
    "toolCalling": true,
    "thinking": false
  }
}
```

## Commands

- **Foundry Model Provider: Set API Key** - Securely store your API key
- **Foundry Model Provider: Clear API Key** - Remove stored API key
- **Foundry Model Provider: Refresh Models** - Refresh model configuration

## Development

### Building

```bash
# One-time build
npm run build

# Watch mode for development
npm run watch
```

### Debugging

1. Open this folder in VS Code
2. Press F5 to launch the Extension Development Host
3. The extension will activate when you open Copilot Chat

## API

This extension uses the `vscode.lm.registerLanguageModelChatProvider` API to register Foundry models with VS Code. Models appear under the "foundry" vendor in the model selector.

## License

MIT
