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

export function createReasoningEffortSchema(
    defaultValue: ReasoningEffort,
    supportedValues?: readonly ReasoningEffort[]
): ReasoningEffortPropertySchema {
    const values = supportedValues ?? REASONING_EFFORT_VALUES;
    const indices = values.map(v => REASONING_EFFORT_VALUES.indexOf(v));
    const labels = indices.map(i => REASONING_EFFORT_LABELS[i]);
    const descriptions = indices.map(i => REASONING_EFFORT_DESCRIPTIONS[i]);

    // Ensure default is in the supported list
    const defaultEffort = values.includes(defaultValue) ? defaultValue : values[0] ?? 'medium';

    return {
        type: 'string',
        title: 'Reasoning Effort',
        enum: values,
        enumItemLabels: labels,
        enumDescriptions: descriptions,
        default: defaultEffort,
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
