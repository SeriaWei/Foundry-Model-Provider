import { describe, it, expect } from 'vitest';
import {
    createReasoningEffortSchema,
    getConfiguredReasoningEffort,
    isReasoningEffortValue,
    resolveReasoningEffort,
} from '../src/reasoningEffort';

describe('reasoningEffort utilities', () => {
    it('should validate reasoning effort values', () => {
        expect(isReasoningEffortValue('minimal')).toBe(true);
        expect(isReasoningEffortValue('medium')).toBe(true);
        expect(isReasoningEffortValue('max')).toBe(true);
        expect(isReasoningEffortValue('invalid')).toBe(false);
        expect(isReasoningEffortValue(undefined)).toBe(false);
    });

    it('should create schema with model default value', () => {
        const schema = createReasoningEffortSchema('high');
        expect(schema.default).toBe('high');
        expect(schema.enum).toEqual([
            'minimal',
            'low',
            'medium',
            'high',
            'xhigh',
            'max',
        ]);
        expect(schema.enumItemLabels).toEqual([
            'Minimal',
            'Low',
            'Medium',
            'High',
            'XHigh',
            'Max',
        ]);
        expect(schema.enumDescriptions).toEqual([
            "Smallest reasoning budget",
            "Low reasoning budget",
            "Balanced reasoning budget",
            "High reasoning budget",
            "Very high reasoning budget",
            "Maximum reasoning budget"
        ]);
    });

    it('should create schema with limited supported values', () => {
        const supported = ['low', 'medium', 'high'] as const;
        const schema = createReasoningEffortSchema('medium', supported);
        expect(schema.enum).toEqual(['low', 'medium', 'high']);
        expect(schema.enumItemLabels).toEqual(['Low', 'Medium', 'High']);
        expect(schema.enumDescriptions).toEqual([
            "Low reasoning budget",
            "Balanced reasoning budget",
            "High reasoning budget",
        ]);
        expect(schema.default).toBe('medium');
    });

    it('should fall back to first supported value when default is not in supported list', () => {
        const supported = ['low', 'medium'] as const;
        const schema = createReasoningEffortSchema('max', supported);
        expect(schema.enum).toEqual(['low', 'medium']);
        expect(schema.default).toBe('low');
    });

    it('should prioritize modelConfiguration over configuration and modelOptions', () => {
        const value = getConfiguredReasoningEffort({
            modelConfiguration: { reasoningEffort: 'xhigh' },
            configuration: { reasoningEffort: 'high' },
            modelOptions: { reasoningEffort: 'low' },
        }, 'medium');

        expect(value).toBe('xhigh');
    });

    it('should fallback to model default when user value is invalid', () => {
        const value = resolveReasoningEffort({
            modelConfiguration: { reasoningEffort: 'invalid' },
        }, 'high');

        expect(value).toBe('high');
    });

    it('should fallback to system default when model default is missing and user value is invalid', () => {
        const value = resolveReasoningEffort({
            modelConfiguration: { reasoningEffort: 'invalid' },
        }, undefined);

        expect(value).toBe('medium');
    });
});
