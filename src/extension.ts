import * as vscode from 'vscode';
import { FoundryLanguageModelChatProvider } from './foundryProvider';
import { TokenizerManager } from './tokenizer/tokenizerManager';
import { VENDOR_ID, EXTENSION_ID } from './types';

let provider: FoundryLanguageModelChatProvider | undefined;
let outputChannel: vscode.LogOutputChannel;

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Create output channel for logging
    outputChannel = vscode.window.createOutputChannel('Foundry Model Provider', { log: true });
    outputChannel.info('Foundry Model Provider extension activating...');

    // Initialize the tokenizer with the extension path (required before any token counting)
    TokenizerManager.initialize(context.extensionPath);
    outputChannel.info('Tokenizer initialized');

    // Create the provider
    provider = new FoundryLanguageModelChatProvider(outputChannel, context.secrets);

    // Initialize the provider (load API key from secrets)
    await provider.initialize();

    // Register the language model chat provider
    outputChannel.info(`Registering language model chat provider with vendor: "${VENDOR_ID}"`);
    const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
        VENDOR_ID,
        provider
    );
    context.subscriptions.push(providerDisposable);
    outputChannel.info('Provider registered successfully');

    // Fire change event to notify VS Code about available models
    //provider.notifyModelsChanged();

    // Log configured models
    const providerConfig = provider.getConfiguration();
    outputChannel.info(`Configured endpoint: ${providerConfig.endpoint || '(not set)'}`);
    outputChannel.info(`Configured models: ${providerConfig.models.map(m => m.id).join(', ') || '(none)'}`);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('foundryModelProvider.setApiKey', async () => {
            await setApiKeyCommand();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('foundryModelProvider.clearApiKey', async () => {
            await clearApiKeyCommand();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('foundryModelProvider.refreshModels', () => {
            refreshModelsCommand();
        })
    );

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(EXTENSION_ID)) {
                outputChannel.info('Configuration changed, refreshing...');
                provider?.refreshConfig();
            }
        })
    );

    // Clean up output channel on deactivate
    context.subscriptions.push(outputChannel);
    context.subscriptions.push({ dispose: () => provider?.dispose() });

    outputChannel.info('Foundry Model Provider extension activated');
    
    // Show a message if not configured (non-blocking, don't await)
    const config = provider.getConfiguration();
    if (!config.endpoint) {
        vscode.window.showWarningMessage(
            'Foundry Model Provider: Endpoint not configured.',
            'Open Settings'
        ).then(action => {
            if (action === 'Open Settings') {
                vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    `${EXTENSION_ID}.endpoint`
                );
            }
        });
    } else if (!provider.isReady()) {
        vscode.window.showWarningMessage(
            'Foundry Model Provider: API key not configured.',
            'Set API Key'
        ).then(action => {
            if (action === 'Set API Key') {
                vscode.commands.executeCommand('foundryModelProvider.setApiKey');
            }
        });
    }
}

/**
 * Set API Key command handler
 */
async function setApiKeyCommand(): Promise<void> {
    const apiKey = await vscode.window.showInputBox({
        title: 'Foundry Model Provider - Set API Key',
        prompt: 'Enter your Microsoft Foundry API key',
        password: true,
        placeHolder: 'Your API key...',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'API key cannot be empty';
            }
            return undefined;
        }
    });

    if (apiKey) {
        await provider?.setApiKey(apiKey.trim());
        vscode.window.showInformationMessage('API key saved successfully.');
        
        // Refresh models after setting API key
        provider?.refreshConfig();
    }
}

/**
 * Clear API Key command handler
 */
async function clearApiKeyCommand(): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        'Are you sure you want to clear the API key?',
        { modal: true },
        'Yes',
        'No'
    );

    if (confirm === 'Yes') {
        await provider?.clearApiKey();
        vscode.window.showInformationMessage('API key cleared.');
    }
}

/**
 * Refresh Models command handler
 */
function refreshModelsCommand(): void {
    provider?.refreshConfig();
    vscode.window.showInformationMessage('Models refreshed.');
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
    outputChannel?.info('Foundry Model Provider extension deactivating...');
}
