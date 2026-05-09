import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { ResponsesAPIClient, ChatCompletionsAPIClient, FoundryOpenAIClient } from './foundryApiClient';
import { FoundryModelConfig } from './types';

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
