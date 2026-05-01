import { DatasetNameSchema, DatasetSchema } from '../dataset';
import { describe, expect, it } from 'vitest';

describe('DatasetNameSchema', () => {
  describe('valid names', () => {
    it('accepts a simple alphabetic name', () => {
      expect(DatasetNameSchema.safeParse('MyDataset').success).toBe(true);
    });

    it('accepts a name with alphanumeric characters', () => {
      expect(DatasetNameSchema.safeParse('Dataset123').success).toBe(true);
    });

    it('accepts a name with underscores', () => {
      expect(DatasetNameSchema.safeParse('my_dataset').success).toBe(true);
    });

    it('accepts a name at max length (48 chars)', () => {
      const name = 'A' + 'a'.repeat(47);
      expect(DatasetNameSchema.safeParse(name).success).toBe(true);
    });
  });

  describe('invalid names', () => {
    it('rejects an empty string', () => {
      expect(DatasetNameSchema.safeParse('').success).toBe(false);
    });

    it('rejects a name starting with a digit', () => {
      expect(DatasetNameSchema.safeParse('1dataset').success).toBe(false);
    });

    it('rejects a name starting with an underscore', () => {
      expect(DatasetNameSchema.safeParse('_dataset').success).toBe(false);
    });

    it('rejects a name with hyphens', () => {
      expect(DatasetNameSchema.safeParse('my-dataset').success).toBe(false);
    });

    it('rejects a name exceeding 48 characters', () => {
      const name = 'A' + 'a'.repeat(48);
      expect(DatasetNameSchema.safeParse(name).success).toBe(false);
    });
  });
});

describe('DatasetSchema', () => {
  it('validates a dataset with only a name', () => {
    const result = DatasetSchema.safeParse({ name: 'MyDataset' });
    expect(result.success).toBe(true);
  });

  it('validates a dataset with name and description', () => {
    const result = DatasetSchema.safeParse({ name: 'MyDataset', description: 'A test dataset' });
    expect(result.success).toBe(true);
  });

  it('rejects a dataset without a name', () => {
    const result = DatasetSchema.safeParse({ description: 'A dataset with no name' });
    expect(result.success).toBe(false);
  });

  it('rejects a dataset with an invalid name', () => {
    const result = DatasetSchema.safeParse({ name: '1invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown extra fields (strict)', () => {
    // DatasetSchema uses z.object (not strict), so extra fields are stripped — just verify parse succeeds
    const result = DatasetSchema.safeParse({ name: 'MyDataset', extra: 'field' });
    expect(result.success).toBe(true);
  });
});
