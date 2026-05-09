import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockStream = {
    [Symbol.asyncIterator]: async function* () {},
};

vi.mock('openai', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            responses: {
                stream: vi.fn().mockReturnValue(mockStream),
            },
            chat: {
                completions: {
                    create: vi.fn().mockResolvedValue(mockStream),
                },
            },
        })),
        APIError: class APIError extends Error {
            status: number;
            constructor(status: number, message: string, body?: unknown, headers?: Record<string, string>) {
                super(message);
                this.name = 'APIError';
                this.status = status;
            }
        },
    };
});

export {};
