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
