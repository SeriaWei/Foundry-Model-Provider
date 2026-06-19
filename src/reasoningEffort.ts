import { ReasoningEffort } from './types';

export const REASONING_EFFORT_VALUES = [
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
] as const;

export interface ReasoningEffortPropertySchema {
    type: 'string';
    title: string;
    enum: readonly ReasoningEffort[];
    enumItemLabels: readonly string[];
    enumDescriptions: readonly string[];
    default: ReasoningEffort;
    group: string;
}

export interface RequestOptionsLike {
    modelConfiguration?: Record<string, unknown>;
    configuration?: Record<string, unknown>;
    modelOptions?: Record<string, unknown>;
}

const REASONING_EFFORT_LABELS = ['Minimal', 'Low', 'Medium', 'High', 'XHigh', 'Max'] as const;
const REASONING_EFFORT_DESCRIPTIONS = [
    "Smallest reasoning budget",
    "Low reasoning budget",
    "Balanced reasoning budget",
    "High reasoning budget",
    "Very high reasoning budget",
    "Maximum reasoning budget"
] as const;

export function createReasoningEffortSchema(defaultValue: ReasoningEffort): ReasoningEffortPropertySchema {
    return {
        type: 'string',
        title: 'Reasoning Effort',
        enum: REASONING_EFFORT_VALUES,
        enumItemLabels: REASONING_EFFORT_LABELS,
        enumDescriptions: REASONING_EFFORT_DESCRIPTIONS,
        default: defaultValue,
        group: 'navigation'
    };
}

export function isReasoningEffortValue(v: unknown): v is ReasoningEffort {
    return typeof v === 'string' && REASONING_EFFORT_VALUES.includes(v as ReasoningEffort);
}

export function getConfiguredReasoningEffort(
    options: RequestOptionsLike | undefined,
    fallback: ReasoningEffort = 'medium'
): ReasoningEffort {
    const candidate =
        options?.modelConfiguration?.reasoningEffort ??
        options?.configuration?.reasoningEffort ??
        options?.modelOptions?.reasoningEffort;

    if (isReasoningEffortValue(candidate)) {
        return candidate;
    }

    return fallback;
}

export function resolveReasoningEffort(
    options: RequestOptionsLike | undefined,
    modelDefaultEffort: string | undefined,
    systemDefault: ReasoningEffort = 'medium'
): ReasoningEffort {
    const fallback = isReasoningEffortValue(modelDefaultEffort)
        ? modelDefaultEffort
        : systemDefault;

    return getConfiguredReasoningEffort(options, fallback);
}
