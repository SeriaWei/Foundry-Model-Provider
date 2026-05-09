import { vi } from 'vitest';

export const LanguageModelChatMessageRole = {
    User: 'user',
    Assistant: 'assistant',
} as const;

export const LanguageModelTextPart = class LanguageModelTextPart {
    constructor(public value: string) {}
};

export const LanguageModelToolCallPart = class LanguageModelToolCallPart {
    constructor(
        public callId: string,
        public name: string,
        public input: object
    ) {}
};

export const LanguageModelToolResultPart = class LanguageModelToolResultPart {
    constructor(
        public callId: string,
        public content: unknown[]
    ) {}
};

export const LanguageModelDataPart = class LanguageModelDataPart {
    constructor(
        public data: Uint8Array,
        public mimeType: string
    ) {}
};

export const LanguageModelThinkingPart = class LanguageModelThinkingPart {
    constructor(public value: string) {}
};

export class LanguageModelError {
    static NoPermissions = class NoPermissions extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'NoPermissions';
        }
    };

    static NotFound = class NotFound extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'NotFound';
        }
    };

    static Blocked = class Blocked extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'Blocked';
        }
    };
}

export const LanguageModelChatToolMode = {
    None: { value: 'none' },
    Auto: { value: 'auto' },
    Required: { value: 'required' },
} as const;

export class CancellationTokenSource {
    token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
    };
    cancel() {
        this.token.isCancellationRequested = true;
    }
}

export const workspace = {
    getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({}),
    }),
};

export const LogOutputChannel = class LogOutputChannel {
    name: string;
    append = vi.fn();
    appendLine = vi.fn();
    clear = vi.fn();
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    trace = vi.fn();
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    replace = vi.fn();

    constructor(name: string) {
        this.name = name;
    }
};

export class SecretStorage {
    store = vi.fn().mockResolvedValue(undefined);
    get = vi.fn().mockResolvedValue(undefined);
    delete = vi.fn().mockResolvedValue(undefined);
    onDidChange = vi.fn();
}

export class EventEmitter<T> {
    event = vi.fn().mockReturnValue(() => {});
    fire = vi.fn();
    dispose = vi.fn();
}

export class Progress<T> {
    report = vi.fn();
}

export interface LanguageModelChatRequestMessage {
    role: string;
    content: readonly unknown[];
    name?: string;
}

export interface LanguageModelChatTool {
    name: string;
    description: string;
    inputSchema: object;
}

export interface LanguageModelChatInformation {
    id: string;
    name: string;
    family: string;
    version: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    capabilities: {
        imageInput: boolean;
        toolCalling: boolean;
    };
    detail?: string;
    tooltip?: string;
}

export type LanguageModelResponsePart = InstanceType<typeof LanguageModelTextPart>;

export interface PrepareLanguageModelChatModelOptions {
    justification?: string;
}

export interface ProvideLanguageModelChatResponseOptions {
    tools?: readonly LanguageModelChatTool[];
    toolMode?: typeof LanguageModelChatToolMode[keyof typeof LanguageModelChatToolMode];
    modelOptions?: Record<string, unknown>;
}
