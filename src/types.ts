import * as vscode from 'vscode';

/**
 * Configuration for a single Foundry model
 */
export interface FoundryModelConfig {
    /** The deployment name / model ID used in API calls */
    id: string;
    /** Display name shown in the model picker */
    name: string;
    /** Model family (e.g., gpt-4o, gpt-4.1, o1) */
    family: string;
    /** Model version string */
    version?: string;
    /** Maximum input tokens supported */
    maxInputTokens: number;
    /** Maximum output tokens supported */
    maxOutputTokens: number;
    /** Model capabilities */
    capabilities: FoundryModelCapabilities;
    /** Which API to use. Defaults to 'responses' */
    apiType?: FoundryApiType;
    /** Reasoning effort for reasoning models (o1, o3, o4, etc.) */
    reasoningEffort?: ReasoningEffort;
}

/**
 * Which API to use for this model
 * - 'responses': Use Responses API (openai.responses.stream) — default
 * - 'completions': Use Chat Completions API (openai.chat.completions.create)
 */
export type FoundryApiType = 'responses' | 'completions';

/**
 * Reasoning effort for reasoning models (o1, o3, o4, etc.)
 */
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Capabilities of a Foundry model
 */
export interface FoundryModelCapabilities {
    /** Whether the model supports image input */
    imageInput: boolean;
    /** Whether the model supports tool/function calling */
    toolCalling: boolean;
    /** Whether the model supports extended thinking (reasoning models) */
    thinking: boolean;
}

/**
 * Default parameters for model requests
 */
export interface FoundryDefaultParameters {
    temperature?: number;
    topP?: number;
}

/**
 * Extension configuration
 */
export interface FoundryProviderConfig {
    endpoint: string;
    models: FoundryModelConfig[];
    defaultParameters: FoundryDefaultParameters;
}

/**
 * Model information returned by the provider
 * Implements vscode.LanguageModelChatInformation
 */
export interface FoundryModelInfo extends vscode.LanguageModelChatInformation {
    /** Internal config reference */
    isUserSelectable: boolean;
    _config: FoundryModelConfig;
}

/**
 * OpenAI-compatible message format for API requests
 */
export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | OpenAIMessageContent[];
    name?: string;
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
}

export type OpenAIMessageContent = 
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface OpenAIToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

/**
 * OpenAI-compatible tool definition
 */
export interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters?: object;
    };
}

/**
 * Streaming response events from OpenAI API
 */
export interface OpenAIStreamEvent {
    type: string;
    delta?: string;
    [key: string]: unknown;
}

/**
 * Constants for the extension
 */
export const VENDOR_ID = 'foundry';
export const EXTENSION_ID = 'foundryModelProvider';
export const SECRET_KEY_API_KEY = 'foundryModelProvider.apiKey';

/**
 * Get the extension configuration
 */
export function getConfig(): FoundryProviderConfig {
    const config = vscode.workspace.getConfiguration(EXTENSION_ID);
    
    return {
        endpoint: config.get<string>('endpoint', ''),
        models: config.get<FoundryModelConfig[]>('models', []),
        defaultParameters: config.get<FoundryDefaultParameters>('defaultParameters', {
            temperature: 0.7,
            topP: 1.0
        })
    };
}
