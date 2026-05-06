import * as vscode from 'vscode';
import {
    FoundryModelConfig,
    FoundryModelInfo,
    FoundryProviderConfig,
    getConfig
} from './types';
import { FoundryOpenAIClient, StreamResponsePart } from './openaiClient';
import { estimateTokenCount, estimateMessageTokenCount } from './messageConverter';

/**
 * Foundry Language Model Chat Provider
 * Implements vscode.LanguageModelChatProvider to provide Foundry models to VS Code
 */
export class FoundryLanguageModelChatProvider implements vscode.LanguageModelChatProvider<FoundryModelInfo> {
    private _onDidChangeLanguageModelChatInformation = new vscode.EventEmitter<void>();
    readonly onDidChangeLanguageModelChatInformation = this._onDidChangeLanguageModelChatInformation.event;

    private client: FoundryOpenAIClient | undefined;
    private config: FoundryProviderConfig;
    private outputChannel: vscode.LogOutputChannel;
    private secretStorage: vscode.SecretStorage;
    private apiKey: string | undefined;

    constructor(
        outputChannel: vscode.LogOutputChannel,
        secretStorage: vscode.SecretStorage
    ) {
        this.outputChannel = outputChannel;
        this.secretStorage = secretStorage;
        this.config = getConfig();
        
        this.outputChannel.info('FoundryLanguageModelChatProvider initialized');
    }

    /**
     * Initialize the provider with the API key
     */
    async initialize(): Promise<void> {
        this.apiKey = await this.secretStorage.get('apiKey');
        
        if (this.apiKey && this.config.endpoint) {
            this.client = new FoundryOpenAIClient(
                this.config.endpoint,
                this.apiKey,
                this.outputChannel
            );
            this.outputChannel.info('OpenAI client initialized');
        } else {
            this.outputChannel.warn('API key or endpoint not configured');
        }
    }

    /**
     * Update the API key
     */
    async setApiKey(apiKey: string): Promise<void> {
        await this.secretStorage.store('apiKey', apiKey);
        this.apiKey = apiKey;
        
        if (this.config.endpoint) {
            if (this.client) {
                this.client.updateApiKey(apiKey);
            } else {
                this.client = new FoundryOpenAIClient(
                    this.config.endpoint,
                    apiKey,
                    this.outputChannel
                );
            }
        }
        
        this.outputChannel.info('API key updated');
    }

    /**
     * Clear the API key
     */
    async clearApiKey(): Promise<void> {
        await this.secretStorage.delete('apiKey');
        this.apiKey = undefined;
        this.client = undefined;
        this.outputChannel.info('API key cleared');
    }

    /**
     * Refresh configuration
     */
    refreshConfig(): void {
        const newConfig = getConfig();
        const endpointChanged = newConfig.endpoint !== this.config.endpoint;
        this.config = newConfig;

        if (endpointChanged && this.apiKey && this.config.endpoint) {
            if (this.client) {
                this.client.updateEndpoint(this.config.endpoint, this.apiKey);
            } else {
                this.client = new FoundryOpenAIClient(
                    this.config.endpoint,
                    this.apiKey,
                    this.outputChannel
                );
            }
        }

        // Notify VS Code that models have changed
        this._onDidChangeLanguageModelChatInformation.fire();
        this.outputChannel.info('Configuration refreshed');
    }

    /**
     * Provide language model chat information
     * Returns the list of available models
     */
    provideLanguageModelChatInformation(
        _options: vscode.PrepareLanguageModelChatModelOptions,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<FoundryModelInfo[]> {
        const models = this.config.models.map(model => this.createModelInfo(model));
        this.outputChannel.info(`provideLanguageModelChatInformation called, returning ${models.length} model(s): ${models.map(m => m.name).join(', ')}`);
        return models;
    }

    /**
     * Create model info from config
     */
    private createModelInfo(model: FoundryModelConfig): FoundryModelInfo {
        const info: FoundryModelInfo = {
            id: model.id,
            name: model.name,
            tooltip: `Foundry Model: ${model.name} (${model.family})`,
            family: model.family,
            version: model.version || '1.0',
            maxInputTokens: model.maxInputTokens,
            maxOutputTokens: model.maxOutputTokens,
            capabilities: {
                imageInput: model.capabilities.imageInput,
                toolCalling: model.capabilities.toolCalling
            },
            _config: model
        };
        this.outputChannel.debug(`Created model info: ${JSON.stringify({ id: info.id, name: info.name, family: info.family })}`);
        return info;
    }

    /**
     * Provide language model chat response
     * Handles the streaming chat completion
     */
    async provideLanguageModelChatResponse(
        model: FoundryModelInfo,
        messages: readonly vscode.LanguageModelChatRequestMessage[],
        options: vscode.ProvideLanguageModelChatResponseOptions,
        progress: vscode.Progress<vscode.LanguageModelResponsePart>,
        token: vscode.CancellationToken
    ): Promise<void> {
        // Check if client is initialized
        if (!this.client) {
            if (!this.apiKey) {
                throw vscode.LanguageModelError.NoPermissions(
                    'API key not configured. Please run "Foundry Model Provider: Set API Key" command.'
                );
            }
            if (!this.config.endpoint) {
                throw vscode.LanguageModelError.NotFound(
                    'Endpoint not configured. Please set foundryModelProvider.endpoint in settings.'
                );
            }
            // Try to initialize client
            this.client = new FoundryOpenAIClient(
                this.config.endpoint,
                this.apiKey,
                this.outputChannel
            );
        }

        this.outputChannel.info(`Generating response with model: ${model.name}`);

        try {
            // Stream the response
            const stream = this.client.streamChatCompletion({
                model: model._config,
                messages,
                tools: options.tools,
                toolMode: options.toolMode,
                modelOptions: options.modelOptions as Record<string, unknown> | undefined,
                defaultParameters: this.config.defaultParameters
            }, token);

            for await (const part of stream) {
                if (token.isCancellationRequested) {
                    break;
                }

                const responsePart = this.convertToResponsePart(part);
                if (responsePart) {
                    progress.report(responsePart);
                }
            }

            this.outputChannel.info('Response generation complete');
        } catch (error) {
            this.outputChannel.error(`Error generating response: ${error}`);
            throw error;
        }
    }

    /**
     * Convert stream response part to VS Code response part
     */
    private convertToResponsePart(part: StreamResponsePart): vscode.LanguageModelResponsePart | null {
        switch (part.type) {
            case 'text':
                return new vscode.LanguageModelTextPart(part.value);
            case 'thinking':
                // TODO: Use LanguageModelThinkingPart when it becomes stable API
                // For now, skip thinking content as it's not in the stable response part union
                //return new vscode.LanguageModelThinkingPart(part.value);
                return null;
            case 'toolCall':
                return new vscode.LanguageModelToolCallPart(
                    part.callId,
                    part.name,
                    part.input
                );
            default:
                return null;
        }
    }

    /**
     * Provide token count estimation
     */
    provideTokenCount(
        _model: FoundryModelInfo,
        text: string | vscode.LanguageModelChatRequestMessage,
        _token: vscode.CancellationToken
    ): Thenable<number> {
        if (typeof text === 'string') {
            return Promise.resolve(estimateTokenCount(text));
        }
        return Promise.resolve(estimateMessageTokenCount(text));
    }

    /**
     * Check if the provider is ready
     */
    isReady(): boolean {
        return this.client !== undefined;
    }

    /**
     * Get current configuration
     */
    getConfiguration(): FoundryProviderConfig {
        return this.config;
    }

    /**
     * Notify VS Code that models have changed
     */
    notifyModelsChanged(): void {
        this.outputChannel.info('Firing onDidChangeLanguageModelChatInformation event');
        this._onDidChangeLanguageModelChatInformation.fire();
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this._onDidChangeLanguageModelChatInformation.dispose();
    }
}
