# Foundry Model Provider

A VS Code extension that provides Microsoft Foundry LLM models as chat model providers for GitHub Copilot Chat.

## Features

- Integrates Microsoft Foundry LLM models into VS Code's chat interface
- Supports streaming responses for real-time interaction
- Configurable models with customizable parameters
- Supports multimodal input (images) for compatible models
- Tool/function calling support
- Secure API key storage using VS Code's secret storage

## Plugin Configuration

After installing the extension, configure it in VS Code Settings:

### Basic Setup

1. Open VS Code Settings
2. Search for "Foundry" in the search box
3. Set `foundryModelProvider.endpoint` to your Foundry API endpoint:
   - e.g., `https://your-service.services.ai.azure.com/openai/v1`
4. Run command **"Foundry Model Provider: Set API Key"** to securely store your API key

### Configuration Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `foundryModelProvider.endpoint` | Microsoft Foundry API endpoint URL | `""` |
| `foundryModelProvider.models` | List of available models to register | See default model below |
| `foundryModelProvider.defaultParameters` | Default parameters for requests | `{ temperature: 0.2, topP: 1.0 }` |

### Model Configuration

Customize `foundryModelProvider.models` in settings to add or modify available models:

#### Model Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Deployment name / model ID used in API calls |
| `name` | string | ✅ | Display name shown in the model picker |
| `family` | string | ✅ | Model family (e.g., gpt-4o, gpt-4.1, o1) |
| `version` | string | ❌ | Model version string |
| `maxInputTokens` | number | ❌ | Maximum input tokens supported (default: 128000) |
| `maxOutputTokens` | number | ❌ | Maximum output tokens supported (default: 16384) |
| `capabilities` | object | ❌ | Model capabilities (imageInput, toolCalling, thinking) |
| `apiType` | string | ❌ | API type: `"responses"` or `"completions"` (default: `"responses"`) |
| `reasoningEffort` | string | ❌ | Default reasoning effort: `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`, `"max"` |
| `supportedReasoningEfforts` | string[] | ❌ | Restrict the reasoning effort dropdown to a subset of values. If not set, all 6 values are shown. |
| `isUserSelectable` | boolean | ❌ | Whether the model appears in the model picker (default: `true`) |

**Example models:**

```json
"foundryModelProvider.models": [
   {
      "id": "DeepSeek-V4-Flash",
      "name": "DeepSeek-V4-Flash",
      "family": "Foundry",
      "version": "2026-04-23",
      "maxInputTokens": 1000000,
      "maxOutputTokens": 128000,
      "capabilities": {
            "imageInput": true,
            "toolCalling": true,
            "thinking": true
      },
      "apiType": "completions",
      "reasoningEffort": "high",
      "supportedReasoningEfforts": ["low", "medium", "high"]
   },
   {
      "id": "gpt-5.3-codex",
      "name": "GPT-5.3-Codex",
      "family": "Foundry",
      "version": "2026-02-24",
      "maxInputTokens": 400000,
      "maxOutputTokens": 128000,
      "capabilities": {
            "imageInput": true,
            "toolCalling": true,
            "thinking": true
      },
      "apiType": "responses",
      "reasoningEffort": "high"
   },
   {
      "id": "gpt-5.4-mini",
      "name": "GPT-5.4-mini",
      "family": "Foundry",
      "version": "2026-03-17",
      "maxInputTokens": 400000,
      "maxOutputTokens": 128000,
      "capabilities": {
            "imageInput": true,
            "toolCalling": true,
            "thinking": true
      },
      "apiType": "responses",
      "reasoningEffort": "xhigh"
   },
   {
      "id": "gpt-4.1",
      "name": "GPT-4.1",
      "family": "Foundry",
      "version": "2025-04-14",
      "maxInputTokens": 1000000,
      "maxOutputTokens": 32768,
      "capabilities": {
            "imageInput": true,
            "toolCalling": true,
            "thinking": false
      },
      "apiType": "responses"
   }
]
```

### Available Commands

- **Foundry Model Provider: Set API Key** - Securely store your API key
- **Foundry Model Provider: Clear API Key** - Remove stored API key
- **Foundry Model Provider: Refresh Models** - Refresh model configuration

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [VS Code](https://code.visualstudio.com/) (latest version recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/SeriaWei/Foundry-Model-Provider.git
   cd Foundry-Model-Provider
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

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

### Packaging

```bash
# Install dependencies (including @vscode/vsce)
npm install

# Create a .vsix package for local distribution
npm run pack

# Create a pre-release .vsix package
npm run pack:pre

# Publish to VS Code Marketplace (requires authentication)
npm run publish
```

Output: `.vsix` file will be generated in the project root directory.

### Using the Package

Install the extension locally in VS Code:
```bash
code --install-extension foundry-model-provider-0.1.0.vsix
```

Or manually:
1. Open VS Code
2. Go to Extensions panel (Ctrl+Shift+X)
3. Click "..." → "Install from VSIX..."
4. Select the `.vsix` file

## API

This extension uses the `vscode.lm.registerLanguageModelChatProvider` API to register Foundry models with VS Code. Models appear under the "foundry" vendor in the model selector.

## License

MIT
