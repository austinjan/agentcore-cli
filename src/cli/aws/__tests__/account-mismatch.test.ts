import { AccountMismatchError } from '../account.js';
import { describe, expect, it } from 'vitest';

describe('AccountMismatchError', () => {
  it('has correct name', () => {
    const err = new AccountMismatchError('111111111111', '222222222222');
    expect(err.name).toBe('AccountMismatchError');
  });

  it('is an instance of Error', () => {
    const err = new AccountMismatchError('111111111111', '222222222222');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores credentials and target account IDs', () => {
    const err = new AccountMismatchError('111111111111', '222222222222');
    expect(err.credentialsAccount).toBe('111111111111');
    expect(err.targetAccount).toBe('222222222222');
  });

  it('has short message with both account IDs', () => {
    const err = new AccountMismatchError('111111111111', '222222222222');
    expect(err.shortMessage).toContain('111111111111');
    expect(err.shortMessage).toContain('222222222222');
  });

  it('has detailed message with fix instructions', () => {
    const err = new AccountMismatchError('111111111111', '222222222222');
    expect(err.message).toContain('111111111111');
    expect(err.message).toContain('222222222222');
    expect(err.message).toContain('To fix this');
    expect(err.message).toContain('aws-targets.json');
  });

  it('short message is different from detailed message', () => {
    const err = new AccountMismatchError('111111111111', '222222222222');
    expect(err.shortMessage).not.toBe(err.message);
    expect(err.message.length).toBeGreaterThan(err.shortMessage.length);
  });
});
