import { describe, it, expect } from 'vitest';
import * as vscode from 'vscode';
import {
    convertToOpenAIMessages,
    convertToOpenAITools,
    estimateTokenCount,
    estimateMessageTokenCount,
} from '../src/messageConverter';

function createTextPart(value: string): vscode.LanguageModelTextPart {
    return {
        value,
    } as unknown as vscode.LanguageModelTextPart;
}

function createToolCallPart(callId: string, name: string, input: object): vscode.LanguageModelToolCallPart {
    return {
        callId,
        name,
        input,
    } as unknown as vscode.LanguageModelToolCallPart;
}

function createToolResultPart(callId: string, content: unknown[]): vscode.LanguageModelToolResultPart {
    return {
        callId,
        content,
    } as unknown as vscode.LanguageModelToolResultPart;
}

function createDataPart(data: Uint8Array, mimeType: string): vscode.LanguageModelDataPart {
    return {
        data,
        mimeType,
    } as unknown as vscode.LanguageModelDataPart;
}

function createUserMessage(content: unknown[]): vscode.LanguageModelChatRequestMessage {
    return {
        role: vscode.LanguageModelChatMessageRole.User,
        content,
    } as unknown as vscode.LanguageModelChatRequestMessage;
}

function createAssistantMessage(content: unknown[], name?: string): vscode.LanguageModelChatRequestMessage {
    return {
        role: vscode.LanguageModelChatMessageRole.Assistant,
        content,
        name,
    } as unknown as vscode.LanguageModelChatRequestMessage;
}

describe('convertToOpenAIMessages', () => {
    it('should convert a simple user text message', () => {
        const messages = [createUserMessage([createTextPart('Hello, world!')])];
        const result = convertToOpenAIMessages(messages);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            role: 'user',
            content: 'Hello, world!',
        });
    });

    it('should convert a simple assistant text message', () => {
        const messages = [createAssistantMessage([createTextPart('Hello! How can I help?')])];
        const result = convertToOpenAIMessages(messages);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            role: 'assistant',
            content: 'Hello! How can I help?',
        });
    });

    it('should convert user message with tool result', () => {
        const messages = [createUserMessage([createToolResultPart('call_123', ['Tool response text'])])];
        const result = convertToOpenAIMessages(messages);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            role: 'tool',
            content: 'Tool response text',
            tool_call_id: 'call_123',
        });
    });

    it('should convert assistant message with tool calls', () => {
        const toolCall = createToolCallPart('call_456', 'get_weather', { city: 'Beijing' });
        const messages = [createAssistantMessage([toolCall])];
        const result = convertToOpenAIMessages(messages);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            role: 'assistant',
            content: '',
            tool_calls: [
                {
                    id: 'call_456',
                    type: 'function',
                    function: {
                        name: 'get_weather',
                        arguments: JSON.stringify({ city: 'Beijing' }),
                    },
                },
            ],
        });
    });

    it('should convert assistant message with text and tool calls', () => {
        const textPart = createTextPart('I need the weather for Beijing.');
        const toolCall = createToolCallPart('call_789', 'get_weather', { city: 'Beijing' });
        const messages = [createAssistantMessage([textPart, toolCall])];
        const result = convertToOpenAIMessages(messages);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            role: 'assistant',
            content: 'I need the weather for Beijing.',
            tool_calls: [
                {
                    id: 'call_789',
                    type: 'function',
                    function: {
                        name: 'get_weather',
                        arguments: JSON.stringify({ city: 'Beijing' }),
                    },
                },
            ],
        });
    });

    it('should convert image data to base64 URL', () => {
        const imageData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const dataPart = createDataPart(imageData, 'image/png');
        const messages = [createUserMessage([dataPart])];
        const result = convertToOpenAIMessages(messages);

        expect(result).toHaveLength(1);
        expect(result[0].content).toBeInstanceOf(Array);
        const contentArray = result[0].content as Array<{ type: string; image_url: { url: string } }>;
        expect(contentArray[0]).toMatchObject({
            type: 'image_url',
            image_url: {
                url: expect.stringContaining('data:image/png;base64,'),
                detail: 'auto',
            },
        });
    });

    it('should convert multiple messages in order', () => {
        const messages = [
            createUserMessage([createTextPart('First message')]),
            createAssistantMessage([createTextPart('Second message')]),
            createUserMessage([createTextPart('Third message')]),
        ];
        const result = convertToOpenAIMessages(messages);

        expect(result).toHaveLength(3);
        expect(result[0].role).toBe('user');
        expect(result[0].content).toBe('First message');
        expect(result[1].role).toBe('assistant');
        expect(result[1].content).toBe('Second message');
        expect(result[2].role).toBe('user');
        expect(result[2].content).toBe('Third message');
    });

    it('should handle empty message array', () => {
        const result = convertToOpenAIMessages([]);
        expect(result).toHaveLength(0);
    });
});

describe('convertToOpenAITools', () => {
    it('should convert a single tool', () => {
        const tools: readonly vscode.LanguageModelChatTool[] = [
            {
                name: 'get_weather',
                description: 'Get weather for a location',
                inputSchema: {
                    type: 'object',
                    properties: {
                        city: { type: 'string' },
                    },
                },
            } as unknown as vscode.LanguageModelChatTool,
        ];

        const result = convertToOpenAITools(tools);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            type: 'function',
            function: {
                name: 'get_weather',
                description: 'Get weather for a location',
                parameters: {
                    type: 'object',
                    properties: {
                        city: { type: 'string' },
                    },
                },
            },
        });
    });

    it('should convert multiple tools', () => {
        const tools: readonly vscode.LanguageModelChatTool[] = [
            {
                name: 'get_weather',
                description: 'Get weather',
                inputSchema: { type: 'object' },
            } as unknown as vscode.LanguageModelChatTool,
            {
                name: 'search',
                description: 'Search the web',
                inputSchema: { type: 'object' },
            } as unknown as vscode.LanguageModelChatTool,
        ];

        const result = convertToOpenAITools(tools);

        expect(result).toHaveLength(2);
        expect(result[0].function.name).toBe('get_weather');
        expect(result[1].function.name).toBe('search');
    });

    it('should handle empty tools array', () => {
        const result = convertToOpenAITools([]);
        expect(result).toHaveLength(0);
    });
});

describe('estimateTokenCount', () => {
    it('should return 1 token for text with 1-4 characters', () => {
        expect(estimateTokenCount('abc')).toBe(1);
        expect(estimateTokenCount('abcd')).toBe(1);
    });

    it('should return correct token count for longer text', () => {
        expect(estimateTokenCount('a'.repeat(8))).toBe(2);
        expect(estimateTokenCount('a'.repeat(12))).toBe(3);
    });

    it('should handle empty string', () => {
        expect(estimateTokenCount('')).toBe(0);
    });

    it('should round up to nearest token', () => {
        expect(estimateTokenCount('abcde')).toBe(2);
    });
});

describe('estimateMessageTokenCount', () => {
    it('should estimate tokens for text part', () => {
        const message = createUserMessage([createTextPart('Hello world')]);
        const result = estimateMessageTokenCount(message);

        expect(result).toBeGreaterThan(0);
        expect(result).toBe(7); // Math.ceil(11/4) + 4 overhead = 3 + 4 = 7
    });

    it('should estimate tokens for data part (image)', () => {
        const imageData = new Uint8Array(100);
        const message = createUserMessage([createDataPart(imageData, 'image/png')]);
        const result = estimateMessageTokenCount(message);

        expect(result).toBeGreaterThanOrEqual(85 + 4);
    });

    it('should estimate tokens for tool call part', () => {
        const toolCall = createToolCallPart('call_1', 'get_weather', { city: 'Beijing' });
        const message = createAssistantMessage([toolCall]);
        const result = estimateMessageTokenCount(message);

        expect(result).toBeGreaterThan(0);
    });

    it('should estimate tokens for tool result part', () => {
        const toolResult = createToolResultPart('call_1', ['Result text']);
        const message = createUserMessage([toolResult]);
        const result = estimateMessageTokenCount(message);

        expect(result).toBeGreaterThan(0);
    });
});
