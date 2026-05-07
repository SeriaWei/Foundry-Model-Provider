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
"foundryModelProvider.models": [
   {
      "id": "DeepSeek-V4-Flash",
      "name": "DeepSeek-V4-Flash",
      "family": "Foundry",
      "version": "2026-04-23",
      "maxInputTokens": 128000,
      "maxOutputTokens": 16384,
      "capabilities": {
            "imageInput": true,
            "toolCalling": true,
            "thinking": true
      },
      "apiType": "completions"
   },
   {
      "id": "gpt-5.3-codex-1",
      "name": "GPT-5.3-Codex-1",
      "family": "Foundry",
      "version": "2026-02-24",
      "maxInputTokens": 128000,
      "maxOutputTokens": 16384,
      "capabilities": {
            "imageInput": true,
            "toolCalling": true,
            "thinking": true
      },
      "apiType": "responses"
   },
   {
      "id": "gpt-5.4-mini",
      "name": "gpt-5.4-mini",
      "family": "Foundry",
      "version": "2026-03-17",
      "maxInputTokens": 128000,
      "maxOutputTokens": 16384,
      "capabilities": {
            "imageInput": true,
            "toolCalling": true,
            "thinking": true
      },
      "apiType": "responses"
   },
   {
      "id": "gpt-4.1",
      "name": "GPT-4.1",
      "family": "Foundry",
      "version": "2024-04-01",
      "maxInputTokens": 128000,
      "maxOutputTokens": 16384,
      "capabilities": {
            "imageInput": true,
            "toolCalling": true,
            "thinking": false
      },
      "apiType": "responses"
   }
]
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

### Packaging

Before packaging, ensure you have [@vscode/vsce](https://github.com/microsoft/vscode-vsce) installed (included in devDependencies).

#### Package Commands

```bash
# Install dependencies (including @vscode/vsce)
npm install

# Create a .vsix package for local distribution
npm run package

# Create a pre-release .vsix package
npm run package:pre

# Publish to VS Code Marketplace (requires authentication)
npm run publish
```

Output: `.vsix` file will be generated in the project root directory.

#### Using the Package

Install the extension locally in VS Code:
```bash
code --install-extension foundry-model-provider-0.1.0.vsix
```

Or manually:
1. Open VS Code
2. Go to Extensions panel (Ctrl+Shift+X)
3. Click "..." → "Install from VSIX..."
4. Select the `.vsix` file

#### Publishing to Marketplace

1. Create a [Personal Access Token](https://dev.azure.com/_usersSettings/tokens) in Azure DevOps:
   - Scope: "Marketplace (publish)"
   - Organization: All accessible organizations
2. Authenticate with vsce:
   ```bash
   vsce login <publisher-name>
   ```
   (Enter your PAT when prompted)
3. Update `version` in `package.json` (e.g., 0.2.0)
4. Publish:
   ```bash
   npm run publish
   ```

#### Publisher Account Setup

- Publisher name must match `publisher` field in `package.json` ("foundry")
- [Create publisher on Visual Studio Marketplace](https://marketplace.visualstudio.com/publishers)
- Generate [Personal Access Token](https://dev.azure.com/_usersSettings/tokens)

### Debugging

1. Open this folder in VS Code
2. Press F5 to launch the Extension Development Host
3. The extension will activate when you open Copilot Chat

## API

This extension uses the `vscode.lm.registerLanguageModelChatProvider` API to register Foundry models with VS Code. Models appear under the "foundry" vendor in the model selector.

## License

MIT
