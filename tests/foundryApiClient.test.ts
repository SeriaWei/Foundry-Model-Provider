import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { ResponsesAPIClient, ChatCompletionsAPIClient, FoundryOpenAIClient } from '../src/foundryApiClient';
import { FoundryModelConfig } from '../src/types';

function createMockHeaders(): Headers {
    return {
        get: vi.fn().mockReturnValue(null),
    } as unknown as Headers;
}

class MockAPIError extends Error {
    status: number;
    headers: Headers;
    request: unknown;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.headers = createMockHeaders();
        this.request = {};
    }
}

function createMockOutputChannel(): vscode.LogOutputChannel {
    return {
        name: 'test',
        append: vi.fn(),
        appendLine: vi.fn(),
        clear: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        replace: vi.fn(),
    } as unknown as vscode.LogOutputChannel;
}

function createMockModelConfig(overrides: Partial<FoundryModelConfig> = {}): FoundryModelConfig {
    return {
        id: 'gpt-4',
        name: 'GPT-4',
        family: 'GPT-4',
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        capabilities: {
            imageInput: true,
            toolCalling: true,
            thinking: false,
        },
        apiType: 'responses',
        ...overrides,
    };
}

async function drainStream<T>(stream: AsyncGenerator<T>): Promise<void> {
    for await (const _part of stream) {
        // Exhaust the generator so the API call is made.
    }
}

async function collectStream<T>(stream: AsyncGenerator<T>): Promise<T[]> {
    const parts: T[] = [];
    for await (const part of stream) {
        parts.push(part);
    }
    return parts;
}

function createEmptyStream(): AsyncGenerator<never> {
    return (async function* () {})();
}

function createStream<T>(items: T[]): AsyncGenerator<T> {
    return (async function* () {
        for (const item of items) {
            yield item;
        }
    })();
}

describe('BaseFoundryClient Error Wrapping', () => {
    let outputChannel: vscode.LogOutputChannel;

    beforeEach(() => {
        outputChannel = createMockOutputChannel();
    });

    it('should wrap OpenAI 401/403 error', () => {
        const mockError = new MockAPIError(401, 'Unauthorized');
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);

        const wrapped = (client as unknown as { wrapError: (error: unknown) => Error }).wrapError(mockError);
        expect(wrapped).toBeInstanceOf(Error);
        expect(wrapped.message).toBe('Unauthorized');
    });

    it('should wrap OpenAI 403 error', () => {
        const mockError = new MockAPIError(403, 'Forbidden');
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);

        const wrapped = (client as unknown as { wrapError: (error: unknown) => Error }).wrapError(mockError);
        expect(wrapped).toBeInstanceOf(Error);
        expect(wrapped.message).toBe('Forbidden');
    });

    it('should wrap OpenAI 404 error', () => {
        const mockError = new MockAPIError(404, 'Not Found');
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);

        const wrapped = (client as unknown as { wrapError: (error: unknown) => Error }).wrapError(mockError);
        expect(wrapped).toBeInstanceOf(Error);
        expect(wrapped.message).toBe('Not Found');
    });

    it('should wrap OpenAI 429 error', () => {
        const mockError = new MockAPIError(429, 'Rate limited');
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);

        const wrapped = (client as unknown as { wrapError: (error: unknown) => Error }).wrapError(mockError);
        expect(wrapped).toBeInstanceOf(Error);
        expect(wrapped.message).toContain('Rate limited');
    });

    it('should wrap generic OpenAI API errors', () => {
        const mockError = new MockAPIError(500, 'Server Error');
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);

        const wrapped = (client as unknown as { wrapError: (error: unknown) => Error }).wrapError(mockError);
        expect(wrapped).toBeInstanceOf(Error);
        expect(wrapped.message).toBe('Server Error');
    });

    it('should return Error instances as-is', () => {
        const error = new Error('Some error');
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);

        const wrapped = (client as unknown as { wrapError: (error: unknown) => Error }).wrapError(error);
        expect(wrapped).toBe(error);
    });

    it('should wrap non-Error values to Error', () => {
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);

        const wrapped = (client as unknown as { wrapError: (error: unknown) => Error }).wrapError('string error');
        expect(wrapped).toBeInstanceOf(Error);
        expect(wrapped.message).toBe('string error');
    });
});

describe('BaseFoundryClient updateApiKey', () => {
    it('should update the API key in ResponsesAPIClient', () => {
        const outputChannel = createMockOutputChannel();
        const client = new ResponsesAPIClient('https://test.com', 'old-key', outputChannel);

        client.updateApiKey('new-key');

        expect(outputChannel.debug).toHaveBeenCalled();
    });

    it('should update the API key in ChatCompletionsAPIClient', () => {
        const outputChannel = createMockOutputChannel();
        const client = new ChatCompletionsAPIClient('https://test.com', 'old-key', outputChannel);

        client.updateApiKey('new-key');

        expect(outputChannel.debug).toHaveBeenCalled();
    });
});

describe('BaseFoundryClient updateEndpoint', () => {
    it('should update the endpoint in ResponsesAPIClient', () => {
        const outputChannel = createMockOutputChannel();
        const client = new ResponsesAPIClient('https://old.com', 'test-key', outputChannel);

        client.updateEndpoint('https://new.com', 'test-key');

        expect(outputChannel.debug).toHaveBeenCalledWith(expect.stringContaining('https://new.com'));
    });

    it('should update the endpoint in ChatCompletionsAPIClient', () => {
        const outputChannel = createMockOutputChannel();
        const client = new ChatCompletionsAPIClient('https://old.com', 'test-key', outputChannel);

        client.updateEndpoint('https://new.com', 'test-key');

        expect(outputChannel.debug).toHaveBeenCalledWith(expect.stringContaining('https://new.com'));
    });
});

describe('FoundryOpenAIClient', () => {
    let outputChannel: vscode.LogOutputChannel;

    beforeEach(() => {
        outputChannel = createMockOutputChannel();
    });

    it('should route to ResponsesAPIClient for responses apiType', async () => {
        const client = new FoundryOpenAIClient('https://test.com', 'test-key', outputChannel);
        const options = {
            model: createMockModelConfig({ apiType: 'responses' }),
            messages: [],
            defaultParameters: { temperature: 0.7 },
        };

        const stream = client.streamChatCompletion(options, { isCancellationRequested: false, onCancellationRequested: vi.fn() });
        expect(stream).toBeDefined();
    });

    it('should route to ChatCompletionsAPIClient for completions apiType', async () => {
        const client = new FoundryOpenAIClient('https://test.com', 'test-key', outputChannel);
        const options = {
            model: createMockModelConfig({ apiType: 'completions' }),
            messages: [],
            defaultParameters: { temperature: 0.7 },
        };

        const stream = client.streamChatCompletion(options, { isCancellationRequested: false, onCancellationRequested: vi.fn() });
        expect(stream).toBeDefined();
    });

    it('should default to ResponsesAPIClient when apiType is undefined', async () => {
        const client = new FoundryOpenAIClient('https://test.com', 'test-key', outputChannel);
        const options = {
            model: createMockModelConfig({ apiType: undefined }),
            messages: [],
            defaultParameters: { temperature: 0.7 },
        };

        const stream = client.streamChatCompletion(options, { isCancellationRequested: false, onCancellationRequested: vi.fn() });
        expect(stream).toBeDefined();
    });

    it('should update API key in both clients', () => {
        const outputChannelForUpdate = createMockOutputChannel();
        const client = new FoundryOpenAIClient('https://test.com', 'old-key', outputChannelForUpdate);

        client.updateApiKey('new-key');

        expect(outputChannelForUpdate.debug).toHaveBeenCalled();
    });

    it('should update endpoint in both clients', () => {
        const client = new FoundryOpenAIClient('https://old.com', 'test-key', outputChannel);

        client.updateEndpoint('https://new.com', 'test-key');

        expect(outputChannel.debug).toHaveBeenCalled();
    });
});

describe('ChatCompletionOptions', () => {
    it('should accept valid model options', () => {
        const options = {
            model: createMockModelConfig({
                reasoningEffort: 'high',
            }),
            messages: [],
            defaultParameters: { temperature: 0.7 },
        };

        expect(options.model.reasoningEffort).toBe('high');
    });

    it('should accept model with all capabilities', () => {
        const options = {
            model: createMockModelConfig({
                capabilities: {
                    imageInput: true,
                    toolCalling: true,
                    thinking: true,
                },
            }),
            messages: [],
            defaultParameters: { temperature: 0.7 },
        };

        expect(options.model.capabilities.imageInput).toBe(true);
        expect(options.model.capabilities.toolCalling).toBe(true);
        expect(options.model.capabilities.thinking).toBe(true);
    });
});

describe('Reasoning effort request parameters', () => {
    it('should pass reasoning effort to the Responses API as reasoning.effort', async () => {
        const outputChannel = createMockOutputChannel();
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);
        const streamMock = vi.fn().mockReturnValue(createEmptyStream());
        (client as unknown as { client: { responses: { stream: typeof streamMock } } }).client.responses.stream = streamMock;

        await drainStream(client.streamChatCompletion({
            model: createMockModelConfig({
                capabilities: {
                    imageInput: false,
                    toolCalling: true,
                    thinking: true,
                },
                reasoningEffort: 'medium',
            }),
            messages: [],
            requestOptions: {
                modelConfiguration: { reasoningEffort: 'high' },
            },
            defaultParameters: { temperature: 0.7 },
        }, { isCancellationRequested: false, onCancellationRequested: vi.fn() }));

        expect(streamMock).toHaveBeenCalledWith(expect.objectContaining({
            reasoning: {
                effort: 'high',
                summary: 'auto',
            },
        }));
        expect(streamMock.mock.calls[0][0]).not.toHaveProperty('temperature');
    });

    it('should pass reasoning effort to Chat Completions as reasoning_effort', async () => {
        const outputChannel = createMockOutputChannel();
        const client = new ChatCompletionsAPIClient('https://test.com', 'test-key', outputChannel);
        const createMock = vi.fn().mockResolvedValue(createEmptyStream());
        (client as unknown as { client: { chat: { completions: { create: typeof createMock } } } }).client.chat.completions.create = createMock;

        await drainStream(client.streamChatCompletion({
            model: createMockModelConfig({
                apiType: 'completions',
                capabilities: {
                    imageInput: false,
                    toolCalling: true,
                    thinking: true,
                },
                reasoningEffort: 'medium',
            }),
            messages: [],
            requestOptions: {
                modelConfiguration: { reasoningEffort: 'low' },
            },
            defaultParameters: { temperature: 0.7, topP: 0.9 },
        }, { isCancellationRequested: false, onCancellationRequested: vi.fn() }));

        expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
            reasoning_effort: 'low',
        }));
        expect(createMock.mock.calls[0][0]).not.toHaveProperty('temperature');
        expect(createMock.mock.calls[0][0]).not.toHaveProperty('top_p');
    });

    it('should not send reasoning effort to non-thinking models', async () => {
        const outputChannel = createMockOutputChannel();
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);
        const streamMock = vi.fn().mockReturnValue(createEmptyStream());
        (client as unknown as { client: { responses: { stream: typeof streamMock } } }).client.responses.stream = streamMock;

        await drainStream(client.streamChatCompletion({
            model: createMockModelConfig({ reasoningEffort: 'medium' }),
            messages: [],
            requestOptions: {
                modelConfiguration: { reasoningEffort: 'high' },
            },
            defaultParameters: { temperature: 0.7 },
        }, { isCancellationRequested: false, onCancellationRequested: vi.fn() }));

        expect(streamMock.mock.calls[0][0]).not.toHaveProperty('reasoning');
        expect(streamMock).toHaveBeenCalledWith(expect.objectContaining({
            temperature: 0.7,
        }));
    });
});

describe('ResponsesAPIClient request and stream mapping', () => {
    it('should use model sampling parameters and omit parameters set to null', async () => {
        const outputChannel = createMockOutputChannel();
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);
        const streamMock = vi.fn().mockReturnValue(createEmptyStream());
        (client as unknown as { client: { responses: { stream: typeof streamMock } } }).client.responses.stream = streamMock;

        await drainStream(client.streamChatCompletion({
            model: createMockModelConfig({ temperature: 0.4, topP: null }),
            messages: [],
            defaultParameters: { temperature: 0.7, topP: 0.9 },
        }, { isCancellationRequested: false, onCancellationRequested: vi.fn() }));

        expect(streamMock).toHaveBeenCalledWith(expect.objectContaining({
            temperature: 0.4,
        }));
        expect(streamMock.mock.calls[0][0]).not.toHaveProperty('top_p');
    });

    it('should build Responses API request parameters for tools and max output tokens', async () => {
        const outputChannel = createMockOutputChannel();
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);
        const streamMock = vi.fn().mockReturnValue(createEmptyStream());
        (client as unknown as { client: { responses: { stream: typeof streamMock } } }).client.responses.stream = streamMock;

        await drainStream(client.streamChatCompletion({
            model: createMockModelConfig(),
            messages: [],
            tools: [{
                name: 'get_weather',
                description: 'Get weather',
                inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
            } as vscode.LanguageModelChatTool],
            modelOptions: {
                temperature: 0.2,
                maxTokens: 512,
            },
            defaultParameters: { temperature: 0.7 },
        }, { isCancellationRequested: false, onCancellationRequested: vi.fn() }));

        expect(streamMock).toHaveBeenCalledWith(expect.objectContaining({
            model: 'gpt-4',
            input: [],
            stream: true,
            temperature: 0.2,
            max_output_tokens: 512,
            tools: [{
                type: 'function',
                name: 'get_weather',
                description: 'Get weather',
                parameters: { type: 'object', properties: { city: { type: 'string' } } },
                strict: false,
            }],
        }));
    });

    it('should convert Responses API stream events into response parts', async () => {
        const outputChannel = createMockOutputChannel();
        const client = new ResponsesAPIClient('https://test.com', 'test-key', outputChannel);
        const streamMock = vi.fn().mockReturnValue(createStream([
            { type: 'response.output_text.delta', delta: 'Hello' },
            { type: 'response.reasoning_summary_text.delta', delta: 'Thinking' },
            { type: 'response.output_item.added', item: { type: 'function_call', id: 'item_1', call_id: 'call_1', name: 'get_weather' } },
            { type: 'response.function_call_arguments.delta', item_id: 'item_1', delta: '{"city"' },
            { type: 'response.function_call_arguments.done', item_id: 'item_1', arguments: '{"city":"Beijing"}' },
            { type: 'response.output_item.done', item: { type: 'function_call', id: 'item_1', call_id: 'call_1', name: 'get_weather', arguments: '{"city":"Beijing"}' } },
            { type: 'response.completed', response: { usage: { input_tokens: 3, output_tokens: 5, total_tokens: 8 } } },
        ]));
        (client as unknown as { client: { responses: { stream: typeof streamMock } } }).client.responses.stream = streamMock;

        const parts = await collectStream(client.streamChatCompletion({
            model: createMockModelConfig(),
            messages: [],
            defaultParameters: { temperature: 0.7 },
        }, { isCancellationRequested: false, onCancellationRequested: vi.fn() }));

        expect(parts).toEqual([
            { type: 'text', value: 'Hello' },
            { type: 'thinking', value: 'Thinking' },
            { type: 'toolCall', callId: 'call_1', name: 'get_weather', input: { city: 'Beijing' } },
            { type: 'usage', value: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 } },
        ]);
    });
});

describe('ChatCompletionsAPIClient request and stream mapping', () => {
    it('should use model sampling parameters and omit parameters set to null', async () => {
        const outputChannel = createMockOutputChannel();
        const client = new ChatCompletionsAPIClient('https://test.com', 'test-key', outputChannel);
        const createMock = vi.fn().mockResolvedValue(createEmptyStream());
        (client as unknown as { client: { chat: { completions: { create: typeof createMock } } } }).client.chat.completions.create = createMock;

        await drainStream(client.streamChatCompletion({
            model: createMockModelConfig({ apiType: 'completions', temperature: null, topP: 0.8 }),
            messages: [],
            defaultParameters: { temperature: 0.7, topP: 0.9 },
        }, { isCancellationRequested: false, onCancellationRequested: vi.fn() }));

        expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
            top_p: 0.8,
        }));
        expect(createMock.mock.calls[0][0]).not.toHaveProperty('temperature');
    });

    it('should build Chat Completions request parameters for required tools and max tokens', async () => {
        const outputChannel = createMockOutputChannel();
        const client = new ChatCompletionsAPIClient('https://test.com', 'test-key', outputChannel);
        const createMock = vi.fn().mockResolvedValue(createEmptyStream());
        (client as unknown as { client: { chat: { completions: { create: typeof createMock } } } }).client.chat.completions.create = createMock;

        await drainStream(client.streamChatCompletion({
            model: createMockModelConfig({ apiType: 'completions' }),
            messages: [],
            tools: [{
                name: 'get_weather',
                description: 'Get weather',
                inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
            } as vscode.LanguageModelChatTool],
            toolMode: vscode.LanguageModelChatToolMode.Required,
            modelOptions: {
                temperature: 0.3,
                maxTokens: 256,
            },
            defaultParameters: { temperature: 0.7 },
        }, { isCancellationRequested: false, onCancellationRequested: vi.fn() }));

        expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
            model: 'gpt-4',
            messages: [],
            stream: true,
            stream_options: { include_usage: true },
            temperature: 0.3,
            max_completion_tokens: 256,
            tool_choice: 'required',
            tools: [{
                type: 'function',
                function: {
                    name: 'get_weather',
                    description: 'Get weather',
                    parameters: { type: 'object', properties: { city: { type: 'string' } } },
                },
            }],
        }));
    });

    it('should convert Chat Completions stream chunks into response parts', async () => {
        const outputChannel = createMockOutputChannel();
        const client = new ChatCompletionsAPIClient('https://test.com', 'test-key', outputChannel);
        const createMock = vi.fn().mockResolvedValue(createStream([
            { choices: [{ delta: { reasoning_content: 'Thinking' } }] },
            { choices: [{ delta: { content: 'Hello' } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search', arguments: '{"q"' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':"foundry"}' } }] }, finish_reason: 'tool_calls' }] },
            { choices: [], usage: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 } },
        ]));
        (client as unknown as { client: { chat: { completions: { create: typeof createMock } } } }).client.chat.completions.create = createMock;

        const parts = await collectStream(client.streamChatCompletion({
            model: createMockModelConfig({ apiType: 'completions' }),
            messages: [],
            defaultParameters: { temperature: 0.7 },
        }, { isCancellationRequested: false, onCancellationRequested: vi.fn() }));

        expect(parts).toEqual([
            { type: 'thinking', value: 'Thinking' },
            { type: 'text', value: 'Hello' },
            { type: 'toolCall', callId: 'call_1', name: 'search', input: { q: 'foundry' } },
            { type: 'usage', value: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 } },
        ]);
    });
});
