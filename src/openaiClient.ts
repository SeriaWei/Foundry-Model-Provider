import * as vscode from 'vscode';
import OpenAI from 'openai';
import { 
    FoundryModelConfig, 
    FoundryDefaultParameters,
    OpenAIMessage,
    OpenAITool
} from './types';
import { convertToOpenAIMessages, convertToOpenAITools } from './messageConverter';

/**
 * Options for chat completion request
 */
export interface ChatCompletionOptions {
    model: FoundryModelConfig;
    messages: readonly vscode.LanguageModelChatRequestMessage[];
    tools?: readonly vscode.LanguageModelChatTool[];
    toolMode?: vscode.LanguageModelChatToolMode;
    modelOptions?: Record<string, unknown>;
    defaultParameters: FoundryDefaultParameters;
}

/**
 * Response part emitted during streaming
 */
export type StreamResponsePart = 
    | { type: 'text'; value: string }
    | { type: 'thinking'; value: string }
    | { type: 'toolCall'; callId: string; name: string; input: object };

/**
 * Wrapper around OpenAI client for Foundry API
 */
export class FoundryOpenAIClient {
    private client: OpenAI;
    private outputChannel: vscode.LogOutputChannel;

    constructor(endpoint: string, apiKey: string, outputChannel: vscode.LogOutputChannel) {
        this.outputChannel = outputChannel;
        
        // Create OpenAI client with custom base URL for Foundry
        this.client = new OpenAI({
            baseURL: endpoint,
            apiKey: apiKey,
            defaultHeaders: {
                'User-Agent': 'vscode-foundry-model-provider'
            }
        });
        
        this.outputChannel.debug(`OpenAI client initialized with endpoint: ${endpoint}`);
    }

    /**
     * Stream a chat completion response using the Responses API
     */
    async *streamChatCompletion(
        options: ChatCompletionOptions,
        token: vscode.CancellationToken
    ): AsyncGenerator<StreamResponsePart> {
        const { model, messages, tools, toolMode, modelOptions, defaultParameters } = options;

        // Convert messages to OpenAI format
        const openaiMessages = convertToOpenAIMessages(messages);
        
        this.outputChannel.debug(`Sending request to model: ${model.id}`);
        this.outputChannel.debug(`Base URL: ${this.client.baseURL}`);
        this.outputChannel.debug(`Input messages (${openaiMessages.length}): ${JSON.stringify(openaiMessages)}`);

        // Build input: combine all messages into input array for Responses API
        // Content type depends on role:
        // - user/system: input_text, input_image
        // - assistant: output_text
        const inputMessages = openaiMessages.map(m => {
            const isAssistant = m.role === 'assistant';
            const textType = isAssistant ? 'output_text' : 'input_text';
            
            let content: string | Array<{type: string; text?: string; image_url?: unknown}>;
            if (typeof m.content === 'string') {
                content = m.content;
            } else if (Array.isArray(m.content)) {
                // Convert Chat Completions format to Responses API format
                content = m.content.map((part: Record<string, unknown>) => {
                    if (part.type === 'text') {
                        return { type: textType, text: part.text as string };
                    } else if (part.type === 'image_url') {
                        // Chat Completions uses { image_url: { url: "data:mime;base64,..." } }
                        // Responses API uses { type: 'input_image', image_url: "data:..." } (flat string)
                        const imageUrl = (part.image_url as Record<string, string>)?.url ?? '';
                        return { type: 'input_image', image_url: imageUrl };
                    }
                    return part as {type: string};
                });
            } else {
                content = String(m.content);
            }
            return {
                role: m.role as 'user' | 'assistant' | 'system',
                content
            };
        });

        // Build request parameters for Responses API
        const requestParams: OpenAI.Responses.ResponseCreateParamsStreaming = {
            model: model.id,
            input: inputMessages as OpenAI.Responses.EasyInputMessage[],
            stream: true,
        };

        // Add optional parameters
        if (modelOptions?.temperature !== undefined) {
            requestParams.temperature = modelOptions.temperature as number;
        } else if (defaultParameters.temperature !== undefined) {
            requestParams.temperature = defaultParameters.temperature;
        }

        if (modelOptions?.maxTokens !== undefined) {
            requestParams.max_output_tokens = modelOptions.maxTokens as number;
        }

        // Add tools if provided
        if (tools && tools.length > 0) {
            const openaiTools = convertToOpenAITools(tools);
            requestParams.tools = openaiTools.map(t => ({
                type: 'function' as const,
                name: t.function.name,
                description: t.function.description,
                parameters: (t.function.parameters ?? null) as Record<string, unknown> | null,
                strict: false
            }));
        }

        try {
            this.outputChannel.debug(`Request payload: ${JSON.stringify(requestParams, null, 2)}`);
            const runner = this.client.responses.stream(requestParams);

            // Track partial tool calls
            const partialToolCalls = new Map<string, { name: string; arguments: string }>();

            runner.on('response.output_text.delta', (diff: { delta: string }) => {
                // handled below in event loop
            });

            for await (const event of runner) {
                if (token.isCancellationRequested) {
                    this.outputChannel.debug('Request cancelled by user');
                    break;
                }

                const e = event as unknown as Record<string, unknown>;
                
                // Log raw API event for debugging
                this.outputChannel.debug(`Raw API event: ${JSON.stringify(e)}`);

                if (e['type'] === 'response.output_text.delta') {
                    const delta = (e as { delta: string }).delta;
                    if (delta) {
                        yield { type: 'text', value: delta };
                    }
                } else if (e['type'] === 'response.reasoning_summary_text.delta') {
                    // Reasoning/thinking content
                    const delta = (e as { delta: string }).delta;
                    if (delta) {
                        yield { type: 'thinking', value: delta };
                    }
                } else if (e['type'] === 'response.function_call_arguments.delta') {
                    const callId = (e as { call_id: string }).call_id;
                    const delta = (e as { delta: string }).delta;
                    if (!partialToolCalls.has(callId)) {
                        partialToolCalls.set(callId, { name: '', arguments: '' });
                    }
                    partialToolCalls.get(callId)!.arguments += delta;
                } else if (e['type'] === 'response.output_item.added') {
                    const item = (e as { item: Record<string, unknown> }).item;
                    if (item?.['type'] === 'function_call') {
                        const callId = item['call_id'] as string;
                        const name = item['name'] as string;
                        if (!partialToolCalls.has(callId)) {
                            partialToolCalls.set(callId, { name, arguments: '' });
                        } else {
                            partialToolCalls.get(callId)!.name = name;
                        }
                    }
                } else if (e['type'] === 'response.completed') {
                    // Emit completed tool calls
                    for (const [callId, toolCall] of partialToolCalls) {
                        try {
                            const parsedArgs = JSON.parse(toolCall.arguments || '{}');
                            yield {
                                type: 'toolCall',
                                callId,
                                name: toolCall.name,
                                input: parsedArgs
                            };
                        } catch {
                            this.outputChannel.error(`Failed to parse tool call arguments for ${callId}`);
                        }
                    }
                    this.outputChannel.debug('Stream completed');
                }
            }
        } catch (error) {
            this.outputChannel.error(`API request failed: ${error}`);
            this.outputChannel.debug(`Error details: ${JSON.stringify(error, null, 2)}`);
            throw this.wrapError(error);
        }
    }

    /**
     * Wrap API errors in VS Code LanguageModelError
     */
    private wrapError(error: unknown): Error {
        if (error instanceof OpenAI.APIError) {
            const message = error.message || 'Unknown API error';
            
            if (error.status === 401 || error.status === 403) {
                return vscode.LanguageModelError.NoPermissions(message);
            }
            
            if (error.status === 404) {
                return vscode.LanguageModelError.NotFound(message);
            }
            
            if (error.status === 429) {
                return vscode.LanguageModelError.Blocked(`Rate limited: ${message}`);
            }
            
            // For other errors, return a generic error
            const wrappedError = new Error(message);
            wrappedError.cause = error;
            return wrappedError;
        }
        
        if (error instanceof Error) {
            return error;
        }
        
        return new Error(String(error));
    }

    /**
     * Update the API key
     */
    updateApiKey(apiKey: string): void {
        this.client = new OpenAI({
            baseURL: this.client.baseURL,
            apiKey: apiKey
        });
    }

    /**
     * Update the endpoint
     */
    updateEndpoint(endpoint: string, apiKey: string): void {
        this.client = new OpenAI({
            baseURL: endpoint,
            apiKey: apiKey
        });
        this.outputChannel.debug(`OpenAI client endpoint updated to: ${endpoint}`);
    }
}
