import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { FoundryLanguageModelChatProvider } from '../src/foundryProvider';
import { FoundryModelInfo } from '../src/types';
import { getConfig } from '../src/types';

vi.mock('../src/foundryApiClient', () => {
    return {
        FoundryOpenAIClient: class {
            streamChatCompletion = vi.fn().mockReturnValue({
                [Symbol.asyncIterator]: async function* () {},
            });
            updateApiKey = vi.fn();
            updateEndpoint = vi.fn();
        },
        StreamResponsePart: {},
    };
});

vi.mock('../src/types', () => ({
    getConfig: vi.fn().mockReturnValue({
        endpoint: 'https://test.foundry.azure.com',
        models: [
            {
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
            },
        ],
        defaultParameters: {
            temperature: 0.7,
            topP: 1.0,
        },
    }),
}));

vi.mock('../src/provideToken', () => ({
    countMessageTokens: vi.fn().mockResolvedValue(10),
}));

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

function createMockSecretStorage(): vscode.SecretStorage {
    const storage = new Map<string, string>();
    return {
        store: vi.fn().mockImplementation((key: string, value: string) => {
            storage.set(key, value);
            return Promise.resolve();
        }),
        get: vi.fn().mockImplementation((key: string) => {
            return Promise.resolve(storage.get(key));
        }),
        delete: vi.fn().mockImplementation((key: string) => {
            storage.delete(key);
            return Promise.resolve();
        }),
        keys: vi.fn().mockImplementation(() => {
            return Promise.resolve(Array.from(storage.keys()));
        }),
        onDidChange: vi.fn(),
    };
}

const PREPARE_MODEL_OPTIONS: vscode.PrepareLanguageModelChatModelOptions = {
    silent: true,
};

function expectModelInfoArray(
    result: vscode.ProviderResult<FoundryModelInfo[]>
): FoundryModelInfo[] {
    if (!Array.isArray(result)) {
        throw new Error('Expected synchronous model info array in test');
    }

    return result;
}

describe('FoundryLanguageModelChatProvider', () => {
    let provider: FoundryLanguageModelChatProvider;
    let outputChannel: vscode.LogOutputChannel;
    let secretStorage: vscode.SecretStorage;

    beforeEach(() => {
        outputChannel = createMockOutputChannel();
        secretStorage = createMockSecretStorage();
        provider = new FoundryLanguageModelChatProvider(outputChannel, secretStorage);
    });

    afterEach(() => {
        provider.dispose();
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with output channel and secret storage', () => {
            expect(provider).toBeInstanceOf(FoundryLanguageModelChatProvider);
            expect(outputChannel.info).toHaveBeenCalledWith('FoundryLanguageModelChatProvider initialized');
        });
    });

    describe('initialize', () => {
        it('should not create client when API key is missing', async () => {
            await provider.initialize();
            expect(provider.isReady()).toBe(false);
        });

        it('should create client when API key and endpoint are available', async () => {
            await secretStorage.store('apiKey', 'test-key');
            await provider.initialize();
            expect(provider.isReady()).toBe(true);
            expect(outputChannel.info).toHaveBeenCalledWith('OpenAI client initialized');
        });
    });

    describe('setApiKey', () => {
        it('should store API key in secret storage', async () => {
            await provider.setApiKey('new-api-key');
            const storedKey = await secretStorage.get('apiKey');
            expect(storedKey).toBe('new-api-key');
        });

        it('should create client when endpoint is configured', async () => {
            await provider.setApiKey('new-api-key');
            expect(provider.isReady()).toBe(true);
            expect(outputChannel.info).toHaveBeenCalledWith('API key updated');
        });
    });

    describe('clearApiKey', () => {
        it('should delete API key from secret storage', async () => {
            await provider.setApiKey('test-key');
            await provider.clearApiKey();
            const storedKey = await secretStorage.get('apiKey');
            expect(storedKey).toBeUndefined();
        });

        it('should set client to undefined', async () => {
            await provider.setApiKey('test-key');
            await provider.clearApiKey();
            expect(provider.isReady()).toBe(false);
        });
    });

    describe('refreshConfig', () => {
        it('should refresh configuration', () => {
            provider.refreshConfig();
            expect(outputChannel.info).toHaveBeenCalledWith('Configuration refreshed');
        });
    });

    describe('provideLanguageModelChatInformation', () => {
        it('should return model info array', () => {
            const result = expectModelInfoArray(provider.provideLanguageModelChatInformation(PREPARE_MODEL_OPTIONS, {
                isCancellationRequested: false,
                onCancellationRequested: vi.fn(),
            }));

            expect(result).toBeInstanceOf(Array);
            expect(result.length).toBeGreaterThan(0);

            const modelInfo = result[0];
            expect(modelInfo.id).toContain('Foundry:');
            expect(modelInfo.name).toBe('GPT-4');
            expect(modelInfo.family).toBe('GPT-4');
            expect(modelInfo.maxInputTokens).toBe(128000);
            expect(modelInfo.maxOutputTokens).toBe(16384);
        });

        it('should include model capabilities', () => {
            const result = expectModelInfoArray(provider.provideLanguageModelChatInformation(PREPARE_MODEL_OPTIONS, {
                isCancellationRequested: false,
                onCancellationRequested: vi.fn(),
            }));

            const modelInfo = result[0] as FoundryModelInfo;
            expect(modelInfo.capabilities).toBeDefined();
            expect(modelInfo.capabilities.imageInput).toBe(true);
            expect(modelInfo.capabilities.toolCalling).toBe(true);
        });

        it('should return internal config reference', () => {
            const result = expectModelInfoArray(provider.provideLanguageModelChatInformation(PREPARE_MODEL_OPTIONS, {
                isCancellationRequested: false,
                onCancellationRequested: vi.fn(),
            }));

            const modelInfo = result[0] as FoundryModelInfo;
            expect(modelInfo._config).toBeDefined();
            expect(modelInfo._config.id).toBe('gpt-4');
        });

        it('should attach reasoning effort dropdown schema when default is valid', () => {
            vi.mocked(getConfig).mockReturnValueOnce({
                endpoint: 'https://test.foundry.azure.com',
                models: [{
                    id: 'o4-mini',
                    name: 'o4-mini',
                    family: 'o4',
                    maxInputTokens: 128000,
                    maxOutputTokens: 16384,
                    capabilities: {
                        imageInput: false,
                        toolCalling: true,
                        thinking: true,
                    },
                    apiType: 'responses',
                    reasoningEffort: 'high',
                }],
                defaultParameters: {
                    temperature: 0.7,
                    topP: 1,
                },
            });

            const localProvider = new FoundryLanguageModelChatProvider(outputChannel, secretStorage);
            const result = expectModelInfoArray(localProvider.provideLanguageModelChatInformation(PREPARE_MODEL_OPTIONS, {
                isCancellationRequested: false,
                onCancellationRequested: vi.fn(),
            }));

            const schema = (result[0] as FoundryModelInfo).configurationSchema;
            expect(schema).toBeDefined();
            expect(schema?.properties.reasoningEffort.default).toBe('high');
            expect(schema?.properties.reasoningEffort.enum).toContain('minimal');
            expect(schema?.properties.reasoningEffort.enum).toContain('max');

            localProvider.dispose();
        });

        it('should not attach reasoning effort dropdown schema when default is invalid', () => {
            vi.mocked(getConfig).mockReturnValueOnce({
                endpoint: 'https://test.foundry.azure.com',
                models: [{
                    id: 'o4-mini',
                    name: 'o4-mini',
                    family: 'o4',
                    maxInputTokens: 128000,
                    maxOutputTokens: 16384,
                    capabilities: {
                        imageInput: false,
                        toolCalling: true,
                        thinking: true,
                    },
                    apiType: 'responses',
                    reasoningEffort: 'unsupported-value' as unknown as 'medium',
                }],
                defaultParameters: {
                    temperature: 0.7,
                    topP: 1,
                },
            });

            const localProvider = new FoundryLanguageModelChatProvider(outputChannel, secretStorage);
            const result = expectModelInfoArray(localProvider.provideLanguageModelChatInformation(PREPARE_MODEL_OPTIONS, {
                isCancellationRequested: false,
                onCancellationRequested: vi.fn(),
            }));

            expect((result[0] as FoundryModelInfo).configurationSchema).toBeUndefined();

            localProvider.dispose();
        });
    });

    describe('getConfiguration', () => {
        it('should return current configuration', () => {
            const config = provider.getConfiguration();
            expect(config).toBeDefined();
            expect(config.endpoint).toBeDefined();
            expect(config.models).toBeDefined();
        });
    });

    describe('notifyModelsChanged', () => {
        it('should fire onDidChangeLanguageModelChatInformation event', () => {
            const fireMock = vi.fn();
            (provider as unknown as { _onDidChangeLanguageModelChatInformation: { event: () => void; fire: () => void } })._onDidChangeLanguageModelChatInformation.fire = fireMock;

            const listener = vi.fn();
            provider.onDidChangeLanguageModelChatInformation(listener);

            provider.notifyModelsChanged();

            expect(fireMock).toHaveBeenCalled();
        });
    });

    describe('provideTokenCount', () => {
        it('should return token count for string', async () => {
            const token = {
                isCancellationRequested: false,
                onCancellationRequested: vi.fn(),
            };

            const result = await provider.provideTokenCount(
                {} as FoundryModelInfo,
                'Hello world',
                token
            );

            expect(typeof result).toBe('number');
        });
    });

    describe('provideLanguageModelChatResponse', () => {
        it('should throw NoPermissions when API key is not configured', async () => {
            const modelInfo: FoundryModelInfo = {
                id: 'Foundry:gpt-4',
                name: 'GPT-4',
                family: 'GPT-4',
                version: '',
                maxInputTokens: 128000,
                maxOutputTokens: 16384,
                capabilities: {
                    imageInput: true,
                    toolCalling: true,
                },
                _config: {
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
                },
            } as unknown as FoundryModelInfo;

            const mockProgress = {
                report: vi.fn(),
            };

            await expect(
                provider.provideLanguageModelChatResponse(
                    modelInfo,
                    [],
                    {
                        tools: [],
                        toolMode: vscode.LanguageModelChatToolMode.Auto,
                    } as vscode.ProvideLanguageModelChatResponseOptions,
                    mockProgress,
                    { isCancellationRequested: false, onCancellationRequested: vi.fn() }
                )
            ).rejects.toThrow();
        });
    });
});

describe('FoundryModelInfo', () => {
    it('should have correct structure for VS Code', () => {
        const modelInfo: FoundryModelInfo = {
            id: 'Foundry:gpt-4',
            name: 'GPT-4',
            family: 'GPT-4',
            version: '2025-01-01',
            maxInputTokens: 128000,
            maxOutputTokens: 16384,
            capabilities: {
                imageInput: true,
                toolCalling: true,
            },
            _config: {
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
            },
        } as unknown as FoundryModelInfo;

        expect(modelInfo.id).toBe('Foundry:gpt-4');
        expect(modelInfo.name).toBe('GPT-4');
        expect(modelInfo.family).toBe('GPT-4');
        expect(modelInfo._config).toBeDefined();
    });
});
