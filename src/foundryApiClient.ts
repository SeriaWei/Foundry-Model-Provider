import * as vscode from 'vscode';
import OpenAI from 'openai';
import { 
    FoundryModelConfig, 
    FoundryDefaultParameters
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

// ─── Abstract base ────────────────────────────────────────────────────────────

abstract class BaseFoundryClient {
    protected client: OpenAI;
    protected outputChannel: vscode.LogOutputChannel;

    constructor(endpoint: string, apiKey: string, outputChannel: vscode.LogOutputChannel) {
        this.outputChannel = outputChannel;
        this.client = new OpenAI({
            baseURL: endpoint,
            apiKey: apiKey,
            defaultHeaders: {
                'User-Agent': 'vscode-foundry-model-provider'
            }
        });
        this.outputChannel.debug(`OpenAI client initialized with endpoint: ${endpoint}`);
    }

    abstract streamChatCompletion(
        options: ChatCompletionOptions,
        token: vscode.CancellationToken
    ): AsyncGenerator<StreamResponsePart>;

    protected wrapError(error: unknown): Error {
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

            const wrappedError = new Error(message);
            wrappedError.cause = error;
            return wrappedError;
        }

        if (error instanceof Error) {
            return error;
        }

        return new Error(String(error));
    }

    updateApiKey(apiKey: string): void {
        this.client = new OpenAI({
            baseURL: this.client.baseURL,
            apiKey: apiKey,
            defaultHeaders: { 'User-Agent': 'vscode-foundry-model-provider' }
        });
    }

    updateEndpoint(endpoint: string, apiKey: string): void {
        this.client = new OpenAI({
            baseURL: endpoint,
            apiKey: apiKey,
            defaultHeaders: { 'User-Agent': 'vscode-foundry-model-provider' }
        });
        this.outputChannel.debug(`OpenAI client endpoint updated to: ${endpoint}`);
    }
}

// ─── Responses API client ─────────────────────────────────────────────────────

export class ResponsesAPIClient extends BaseFoundryClient {
    async *streamChatCompletion(
        options: ChatCompletionOptions,
        token: vscode.CancellationToken
    ): AsyncGenerator<StreamResponsePart> {
        const { model, messages, tools, modelOptions, defaultParameters } = options;

        const openaiMessages = convertToOpenAIMessages(messages);

        this.outputChannel.debug(`Sending request to model: ${model.id}`);
        this.outputChannel.debug(`Base URL: ${this.client.baseURL}`);
        this.outputChannel.debug(`Input messages (${openaiMessages.length}): ${JSON.stringify(openaiMessages)}`);

        // Map to Responses API content types:
        //   user/system → input_text / input_image
        //   assistant   → output_text
        //   tool result → { type: 'function_call_output', call_id, output }
        //   assistant tool_calls → { type: 'function_call', call_id, name, arguments }
        const inputMessages = openaiMessages.flatMap(m => {
            // Tool result messages must become function_call_output items
            if (m.role === 'tool') {
                return [{
                    type: 'function_call_output' as const,
                    call_id: m.tool_call_id!,
                    output: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                }];
            }

            const isAssistant = m.role === 'assistant';
            const textType = isAssistant ? 'output_text' : 'input_text';

            let content: string | Array<{ type: string; text?: string; image_url?: unknown }>;
            if (typeof m.content === 'string') {
                content = m.content;
            } else if (Array.isArray(m.content)) {
                content = m.content.map((part: Record<string, unknown>) => {
                    if (part.type === 'text') {
                        return { type: textType, text: part.text as string };
                    } else if (part.type === 'image_url') {
                        // Chat Completions: { image_url: { url: "data:..." } }
                        // Responses API:    { type: 'input_image', image_url: "data:..." }
                        const imageUrl = (part.image_url as Record<string, string>)?.url ?? '';
                        return { type: 'input_image', image_url: imageUrl };
                    }
                    return part as { type: string };
                });
            } else {
                content = String(m.content);
            }

            // Assistant messages with tool_calls become function_call items
            if (isAssistant && m.tool_calls && m.tool_calls.length > 0) {
                const items: unknown[] = m.tool_calls.map(tc => ({
                    type: 'function_call' as const,
                    call_id: tc.id,
                    name: tc.function.name,
                    arguments: tc.function.arguments
                }));
                // Include any accompanying text content
                const hasContent = typeof content === 'string' ? content.length > 0 : (content as unknown[]).length > 0;
                if (hasContent) {
                    items.unshift({ role: 'assistant' as const, content });
                }
                return items;
            }

            return [{
                role: m.role as 'user' | 'assistant' | 'system',
                content
            }];
        });

        const requestParams: OpenAI.Responses.ResponseCreateParamsStreaming = {
            model: model.id,
            input: inputMessages as OpenAI.Responses.ResponseCreateParamsStreaming['input'],
            stream: true,
        };

        const reasoningEffort = (modelOptions?.reasoningEffort ?? model.reasoningEffort) as string | undefined;
        if (reasoningEffort) {
            // Reasoning models (o1, o3, o4, etc.) use the `reasoning` parameter
            // and do not support temperature
            (requestParams as unknown as Record<string, unknown>)['reasoning'] = { effort: reasoningEffort, summary: 'auto' };
        } else {
            if (modelOptions?.temperature !== undefined) {
                requestParams.temperature = modelOptions.temperature as number;
            } else if (defaultParameters.temperature !== undefined) {
                requestParams.temperature = defaultParameters.temperature;
            }
        }

        if (modelOptions?.maxTokens !== undefined) {
            requestParams.max_output_tokens = modelOptions.maxTokens as number;
        }

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

            const partialToolCalls = new Map<string, { name: string; callId: string; arguments: string }>();

            for await (const event of runner) {
                if (token.isCancellationRequested) {
                    this.outputChannel.debug('Request cancelled by user');
                    break;
                }

                const e = event as unknown as Record<string, unknown>;
                this.outputChannel.debug(`Raw API event: ${JSON.stringify(e)}`);

                if (e['type'] === 'response.output_text.delta') {
                    const delta = (e as { delta: string }).delta;
                    if (delta) {
                        yield { type: 'text', value: delta };
                    }
                } else if (e['type'] === 'response.reasoning_summary_text.delta') {
                    const delta = (e as { delta: string }).delta;
                    if (delta) {
                        this.outputChannel.info(`[Thinking] ${delta}`);
                        yield { type: 'thinking', value: delta };
                    }
                } else if (e['type'] === 'response.function_call_arguments.delta') {
                    const itemId = (e as { item_id: string }).item_id;
                    const delta = (e as { delta: string }).delta;
                    if (!partialToolCalls.has(itemId)) {
                        partialToolCalls.set(itemId, { name: '', callId: '', arguments: '' });
                    }
                    partialToolCalls.get(itemId)!.arguments += delta;
                } else if (e['type'] === 'response.output_item.added') {
                    const item = (e as { item: Record<string, unknown> }).item;
                    if (item?.['type'] === 'function_call') {
                        const itemId = item['id'] as string;
                        const callId = item['call_id'] as string;
                        const name = item['name'] as string;
                        if (!partialToolCalls.has(itemId)) {
                            partialToolCalls.set(itemId, { name, callId, arguments: '' });
                        } else {
                            const existing = partialToolCalls.get(itemId)!;
                            existing.name = name;
                            existing.callId = callId;
                        }
                    }
                } else if (e['type'] === 'response.function_call_arguments.done') {
                    // Use the authoritative final arguments string from the API
                    const itemId = (e as { item_id: string }).item_id;
                    const args = (e as { arguments: string }).arguments;
                    if (!partialToolCalls.has(itemId)) {
                        // done arrived before output_item.added — upsert
                        partialToolCalls.set(itemId, { name: '', callId: '', arguments: args });
                    } else {
                        partialToolCalls.get(itemId)!.arguments = args;
                    }
                } else if (e['type'] === 'response.output_item.done') {
                    // Emit each tool call as soon as its item is fully done.
                    // Use the item's own fields as the authoritative source for call_id, name, and arguments.
                    const item = (e as { item: Record<string, unknown> }).item;
                    if (item?.['type'] === 'function_call') {
                        const itemId = item['id'] as string;
                        const accumulated = partialToolCalls.get(itemId);
                        const callId = (item['call_id'] as string) || accumulated?.callId || '';
                        const name = (item['name'] as string) || accumulated?.name || '';
                        const args = (item['arguments'] as string) ?? accumulated?.arguments ?? '{}';
                        try {
                            const parsedArgs = JSON.parse(args || '{}');
                            yield { type: 'toolCall', callId, name, input: parsedArgs };
                        } catch {
                            this.outputChannel.error(`Failed to parse tool call arguments for ${callId}`);
                        }
                        partialToolCalls.delete(itemId);
                    }
                } else if (e['type'] === 'response.completed') {
                    // Fallback: emit any tool calls not yet emitted via output_item.done
                    for (const [, toolCall] of partialToolCalls) {
                        try {
                            const parsedArgs = JSON.parse(toolCall.arguments || '{}');
                            yield { type: 'toolCall', callId: toolCall.callId, name: toolCall.name, input: parsedArgs };
                        } catch {
                            this.outputChannel.error(`Failed to parse tool call arguments for ${toolCall.callId}`);
                        }
                    }
                    partialToolCalls.clear();
                    this.outputChannel.debug('Stream completed');
                }
            }
        } catch (error) {
            this.outputChannel.error(`Responses API request failed: ${error}`);
            this.outputChannel.debug(`Error details: ${JSON.stringify(error, null, 2)}`);
            throw this.wrapError(error);
        }
    }
}

// ─── Chat Completions API client ──────────────────────────────────────────────

export class ChatCompletionsAPIClient extends BaseFoundryClient {
    async *streamChatCompletion(
        options: ChatCompletionOptions,
        token: vscode.CancellationToken
    ): AsyncGenerator<StreamResponsePart> {
        const { model, messages, tools, toolMode, modelOptions, defaultParameters } = options;

        const openaiMessages = convertToOpenAIMessages(messages);

        this.outputChannel.debug(`Sending request to model: ${model.id}`);
        this.outputChannel.debug(`Base URL: ${this.client.baseURL}`);
        this.outputChannel.debug(`Input messages (${openaiMessages.length}): ${JSON.stringify(openaiMessages)}`);

        const requestParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
            model: model.id,
            messages: openaiMessages.map(m => {
                // Tool result messages require tool_call_id
                if (m.role === 'tool') {
                    return {
                        role: 'tool' as const,
                        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                        tool_call_id: m.tool_call_id!
                    };
                }
                const mapped: OpenAI.Chat.ChatCompletionMessageParam = {
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: Array.isArray(m.content)
                        ? (m.content as Array<Record<string, unknown>>).map(p => {
                            if (p.type === 'text') { return { type: 'text' as const, text: p.text as string }; }
                            if (p.type === 'image_url') { return { type: 'image_url' as const, image_url: p.image_url as OpenAI.Chat.ChatCompletionContentPartImage['image_url'] }; }
                            return p as unknown as OpenAI.Chat.ChatCompletionContentPart;
                        })
                        : m.content as string
                } as OpenAI.Chat.ChatCompletionMessageParam;
                // Assistant messages in history may carry tool_calls
                if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
                    (mapped as OpenAI.Chat.ChatCompletionAssistantMessageParam).tool_calls =
                        m.tool_calls as OpenAI.Chat.ChatCompletionMessageToolCall[];
                }
                return mapped;
            }) as OpenAI.Chat.ChatCompletionMessageParam[],
            stream: true,
            temperature: (modelOptions?.temperature as number) ?? defaultParameters.temperature ?? 0.7,
        };

        const reasoningEffort = (modelOptions?.reasoningEffort ?? model.reasoningEffort) as string | undefined;
        if (reasoningEffort) {
            // Reasoning models do not support temperature — remove it and set reasoning_effort
            delete requestParams.temperature;
            (requestParams as unknown as Record<string, unknown>)['reasoning_effort'] = reasoningEffort;
        }

        if (modelOptions?.maxTokens) {
            requestParams.max_completion_tokens = modelOptions.maxTokens as number;
        }

        if (tools && tools.length > 0) {
            const openaiTools = convertToOpenAITools(tools);
            requestParams.tools = openaiTools as OpenAI.Chat.ChatCompletionTool[];
            requestParams.tool_choice = toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto';
        }

        this.outputChannel.debug(`Chat Completions request: ${JSON.stringify(requestParams, null, 2)}`);

        try {
            const stream = await this.client.chat.completions.create(requestParams);
            const partialToolCalls = new Map<number, { id: string; name: string; arguments: string }>();

            for await (const chunk of stream) {
                if (token.isCancellationRequested) { break; }
                
                this.outputChannel.debug(`Received stream chunk: ${JSON.stringify(chunk)}`);

                const choice = chunk.choices[0];
                if (!choice) { continue; }

                // reasoning_content is not in the standard OpenAI types but is emitted by
                // reasoning models (e.g. DeepSeek-R1) in OpenAI-compatible Chat Completions streams.
                const reasoningDelta = (choice.delta as Record<string, unknown>)['reasoning_content'];
                if (typeof reasoningDelta === 'string' && reasoningDelta) {
                    this.outputChannel.info(`[Thinking] ${reasoningDelta}`);
                    yield { type: 'thinking', value: reasoningDelta };
                }

                if (choice.delta.content) {
                    yield { type: 'text', value: choice.delta.content };
                }

                for (const tc of choice.delta.tool_calls ?? []) {
                    if (!partialToolCalls.has(tc.index)) {
                        partialToolCalls.set(tc.index, { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' });
                    }
                    const partial = partialToolCalls.get(tc.index)!;
                    if (tc.id) { partial.id = tc.id; }
                    if (tc.function?.name) { partial.name = tc.function.name; }
                    if (tc.function?.arguments) { partial.arguments += tc.function.arguments; }
                }

                if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
                    if (partialToolCalls.size > 0) {
                        for (const [, tc] of partialToolCalls) {
                            try {
                                yield { type: 'toolCall', callId: tc.id, name: tc.name, input: JSON.parse(tc.arguments || '{}') };
                            } catch {
                                this.outputChannel.error(`Failed to parse tool call arguments`);
                            }
                        }
                        partialToolCalls.clear();
                    }
                }
            }
        } catch (error) {
            this.outputChannel.error(`Chat Completions API request failed: ${error}`);
            throw this.wrapError(error);
        }
    }
}

// ─── Public facade ────────────────────────────────────────────────────────────

/**
 * Routes requests to ResponsesAPIClient or ChatCompletionsAPIClient
 * based on each model's `apiType` setting.
 *
 * - 'responses' (default) → ResponsesAPIClient
 * - 'completions'         → ChatCompletionsAPIClient
 */
export class FoundryOpenAIClient {
    private responsesClient: ResponsesAPIClient;
    private completionsClient: ChatCompletionsAPIClient;
    private outputChannel: vscode.LogOutputChannel;

    constructor(endpoint: string, apiKey: string, outputChannel: vscode.LogOutputChannel) {
        this.outputChannel = outputChannel;
        this.responsesClient = new ResponsesAPIClient(endpoint, apiKey, outputChannel);
        this.completionsClient = new ChatCompletionsAPIClient(endpoint, apiKey, outputChannel);
    }

    async *streamChatCompletion(
        options: ChatCompletionOptions,
        token: vscode.CancellationToken
    ): AsyncGenerator<StreamResponsePart> {
        const apiType = options.model.apiType ?? 'responses';
        this.outputChannel.debug(`API type: ${apiType}`);

        if (apiType === 'completions') {
            yield* this.completionsClient.streamChatCompletion(options, token);
        } else {
            yield* this.responsesClient.streamChatCompletion(options, token);
        }
    }

    updateApiKey(apiKey: string): void {
        this.responsesClient.updateApiKey(apiKey);
        this.completionsClient.updateApiKey(apiKey);
    }

    updateEndpoint(endpoint: string, apiKey: string): void {
        this.responsesClient.updateEndpoint(endpoint, apiKey);
        this.completionsClient.updateEndpoint(endpoint, apiKey);
    }
}
