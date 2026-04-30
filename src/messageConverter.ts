import * as vscode from 'vscode';
import { OpenAIMessage, OpenAIMessageContent, OpenAITool, OpenAIToolCall } from './types';

/**
 * Converts VS Code LanguageModelChatRequestMessage to OpenAI message format
 */
export function convertToOpenAIMessages(
    messages: readonly vscode.LanguageModelChatRequestMessage[]
): OpenAIMessage[] {
    return messages.map(convertSingleMessage);
}

/**
 * Convert a single VS Code message to OpenAI format
 */
function convertSingleMessage(message: vscode.LanguageModelChatRequestMessage): OpenAIMessage {
    const role = message.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'assistant';
    const content = message.content as readonly unknown[];
    
    // Check if this is a simple text message or complex content
    const convertedContent = convertMessageContent(content);
    
    // Check for tool calls in assistant messages
    const toolCalls = extractToolCalls(content);
    
    // Check for tool results in user messages
    const toolCallId = extractToolCallId(content);
    
    if (toolCallId) {
        // This is a tool result message
        return {
            role: 'tool',
            content: typeof convertedContent === 'string' ? convertedContent : JSON.stringify(convertedContent),
            tool_call_id: toolCallId
        };
    }
    
    const openaiMessage: OpenAIMessage = {
        role,
        content: convertedContent
    };
    
    if (message.name) {
        openaiMessage.name = message.name;
    }
    
    if (toolCalls && toolCalls.length > 0) {
        openaiMessage.tool_calls = toolCalls;
    }
    
    return openaiMessage;
}

/**
 * Convert message content parts to OpenAI format
 */
function convertMessageContent(content: readonly unknown[]): string | OpenAIMessageContent[] {
    const parts: OpenAIMessageContent[] = [];
    let hasOnlyText = true;
    
    for (const part of content) {
        if (isTextPart(part)) {
            parts.push({ type: 'text', text: part.value });
        } else if (isDataPart(part)) {
            hasOnlyText = false;
            // Handle image data
            if (part.mimeType.startsWith('image/')) {
                const base64Data = bufferToBase64(part.data);
                parts.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${part.mimeType};base64,${base64Data}`,
                        detail: 'auto'
                    }
                });
            } else {
                // For non-image data, try to convert to text
                const text = Buffer.from(part.data).toString('utf-8');
                parts.push({ type: 'text', text });
            }
        } else if (isToolResultPart(part)) {
            // Tool results are handled separately
            const resultText = extractToolResultText(part);
            parts.push({ type: 'text', text: resultText });
        }
        // Skip tool call parts - they're handled separately
    }
    
    // If only text parts, return as simple string for efficiency
    if (hasOnlyText && parts.length === 1 && parts[0].type === 'text') {
        return parts[0].text;
    }
    
    return parts.length > 0 ? parts : '';
}

/**
 * Extract tool calls from message content
 */
function extractToolCalls(content: readonly unknown[]): OpenAIToolCall[] | undefined {
    const toolCalls: OpenAIToolCall[] = [];
    
    for (const part of content) {
        if (isToolCallPart(part)) {
            toolCalls.push({
                id: part.callId,
                type: 'function',
                function: {
                    name: part.name,
                    arguments: JSON.stringify(part.input)
                }
            });
        }
    }
    
    return toolCalls.length > 0 ? toolCalls : undefined;
}

/**
 * Extract tool call ID from tool result parts
 */
function extractToolCallId(content: readonly unknown[]): string | undefined {
    for (const part of content) {
        if (isToolResultPart(part)) {
            return part.callId;
        }
    }
    return undefined;
}

/**
 * Extract text from tool result content
 */
function extractToolResultText(part: { callId: string; content: unknown[] }): string {
    const texts: string[] = [];
    for (const item of part.content) {
        if (isTextPart(item)) {
            texts.push(item.value);
        } else if (typeof item === 'string') {
            texts.push(item);
        } else {
            texts.push(JSON.stringify(item));
        }
    }
    return texts.join('\n');
}

/**
 * Convert VS Code LanguageModelChatTool to OpenAI tool format
 */
export function convertToOpenAITools(tools: readonly vscode.LanguageModelChatTool[]): OpenAITool[] {
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
        }
    }));
}

/**
 * Convert buffer to base64 string
 */
function bufferToBase64(buffer: Uint8Array): string {
    return Buffer.from(buffer).toString('base64');
}

// Type guards for message parts
function isTextPart(part: unknown): part is vscode.LanguageModelTextPart {
    return typeof part === 'object' && part !== null && 'value' in part && typeof (part as vscode.LanguageModelTextPart).value === 'string' &&
        !('callId' in part) && !('data' in part);
}

function isDataPart(part: unknown): part is vscode.LanguageModelDataPart {
    return typeof part === 'object' && part !== null && 'data' in part && 'mimeType' in part;
}

function isToolCallPart(part: unknown): part is vscode.LanguageModelToolCallPart {
    return typeof part === 'object' && part !== null && 'callId' in part && 'name' in part && 'input' in part;
}

function isToolResultPart(part: unknown): part is vscode.LanguageModelToolResultPart {
    return typeof part === 'object' && part !== null && 'callId' in part && 'content' in part && !('name' in part);
}

/**
 * Estimate token count for text
 * Uses a simple heuristic: ~4 characters per token on average
 */
export function estimateTokenCount(text: string): number {
    // Simple estimation: 4 characters ≈ 1 token
    // This is a rough approximation for English text
    return Math.ceil(text.length / 4);
}

/**
 * Estimate token count for a message
 */
export function estimateMessageTokenCount(message: vscode.LanguageModelChatMessage | vscode.LanguageModelChatRequestMessage): number {
    let totalTokens = 0;
    const content = message.content as readonly unknown[];
    
    for (const part of content) {
        if (isTextPart(part)) {
            totalTokens += estimateTokenCount(part.value);
        } else if (isDataPart(part)) {
            // Images typically use a fixed token count based on detail level
            // This is a rough estimate
            totalTokens += 85; // Low detail image tokens
        } else if (isToolCallPart(part)) {
            totalTokens += estimateTokenCount(part.name);
            totalTokens += estimateTokenCount(JSON.stringify(part.input));
        } else if (isToolResultPart(part)) {
            totalTokens += estimateTokenCount(JSON.stringify(part.content));
        }
    }
    
    // Add overhead for message structure
    totalTokens += 4;
    
    return totalTokens;
}
