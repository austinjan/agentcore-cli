import type { AwsDeploymentTarget } from '../../../schema';
import { applyTargetRegionToEnv, runWithTargetRegion, withTargetRegion } from '../target-region.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('target-region', () => {
  let savedRegion: string | undefined;
  let savedDefaultRegion: string | undefined;

  beforeEach(() => {
    savedRegion = process.env.AWS_REGION;
    savedDefaultRegion = process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
  });

  afterEach(() => {
    if (savedRegion !== undefined) process.env.AWS_REGION = savedRegion;
    else delete process.env.AWS_REGION;
    if (savedDefaultRegion !== undefined) process.env.AWS_DEFAULT_REGION = savedDefaultRegion;
    else delete process.env.AWS_DEFAULT_REGION;
  });

  describe('applyTargetRegionToEnv', () => {
    it('sets AWS_REGION and AWS_DEFAULT_REGION to the provided region', () => {
      applyTargetRegionToEnv('ap-southeast-2');
      expect(process.env.AWS_REGION).toBe('ap-southeast-2');
      expect(process.env.AWS_DEFAULT_REGION).toBe('ap-southeast-2');
    });

    it('returns a restore function that clears env vars when they were previously unset', () => {
      const restore = applyTargetRegionToEnv('eu-west-1');
      restore();
      expect(process.env.AWS_REGION).toBeUndefined();
      expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
    });

    it('returns a restore function that restores previous env var values', () => {
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_DEFAULT_REGION = 'us-east-1';

      const restore = applyTargetRegionToEnv('ap-south-1');
      expect(process.env.AWS_REGION).toBe('ap-south-1');
      expect(process.env.AWS_DEFAULT_REGION).toBe('ap-south-1');

      restore();
      expect(process.env.AWS_REGION).toBe('us-east-1');
      expect(process.env.AWS_DEFAULT_REGION).toBe('us-east-1');
    });

    it('restores each env var independently (only one was previously set)', () => {
      process.env.AWS_REGION = 'us-west-2';
      // AWS_DEFAULT_REGION intentionally left unset

      const restore = applyTargetRegionToEnv('eu-central-1');
      expect(process.env.AWS_REGION).toBe('eu-central-1');
      expect(process.env.AWS_DEFAULT_REGION).toBe('eu-central-1');

      restore();
      expect(process.env.AWS_REGION).toBe('us-west-2');
      expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
    });
  });

  describe('withTargetRegion', () => {
    it('applies region inside the callback and restores afterwards', async () => {
      let seenRegion: string | undefined;
      let seenDefaultRegion: string | undefined;

      await withTargetRegion('ap-northeast-1', () => {
        seenRegion = process.env.AWS_REGION;
        seenDefaultRegion = process.env.AWS_DEFAULT_REGION;
        return Promise.resolve();
      });

      expect(seenRegion).toBe('ap-northeast-1');
      expect(seenDefaultRegion).toBe('ap-northeast-1');
      expect(process.env.AWS_REGION).toBeUndefined();
      expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
    });

    it('restores env vars even when the callback throws', async () => {
      process.env.AWS_REGION = 'us-east-1';

      await expect(
        withTargetRegion('sa-east-1', () => {
          expect(process.env.AWS_REGION).toBe('sa-east-1');
          return Promise.reject(new Error('boom'));
        })
      ).rejects.toThrow('boom');

      expect(process.env.AWS_REGION).toBe('us-east-1');
      expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
    });

    it('returns the callback result', async () => {
      const result = await withTargetRegion('eu-west-2', () => Promise.resolve(42));
      expect(result).toBe(42);
    });
  });

  describe('runWithTargetRegion', () => {
    const makeTarget = (region: string): AwsDeploymentTarget => ({
      name: 'default',
      account: '123456789012',
      region: region as AwsDeploymentTarget['region'],
    });

    it('applies the resolved target region inside fn and restores afterwards', async () => {
      process.env.AWS_REGION = 'us-east-1';
      let observedRegion: string | undefined;
      let observedDefaultRegion: string | undefined;

      const result = await runWithTargetRegion(
        () => Promise.resolve(makeTarget('ap-southeast-2')),
        target => {
          observedRegion = process.env.AWS_REGION;
          observedDefaultRegion = process.env.AWS_DEFAULT_REGION;
          expect(target?.region).toBe('ap-southeast-2');
          return Promise.resolve('ok');
        }
      );

      expect(observedRegion).toBe('ap-southeast-2');
      // applyTargetRegionToEnv sets BOTH env vars; assert the second one too
      // so a regression that drops AWS_DEFAULT_REGION inside the override
      // window would be caught by this test.
      expect(observedDefaultRegion).toBe('ap-southeast-2');
      expect(result).toBe('ok');
      expect(process.env.AWS_REGION).toBe('us-east-1');
    });

    it('skips the override when no target is resolved and does not mutate env', async () => {
      process.env.AWS_REGION = 'us-east-1';
      let observedRegion: string | undefined;

      await runWithTargetRegion(
        () => Promise.resolve(undefined),
        target => {
          observedRegion = process.env.AWS_REGION;
          expect(target).toBeUndefined();
          return Promise.resolve();
        }
      );

      expect(observedRegion).toBe('us-east-1');
      expect(process.env.AWS_REGION).toBe('us-east-1');
    });

    it('skips the override when the resolved target has a falsy region', async () => {
      process.env.AWS_REGION = 'us-east-1';
      // Cast through unknown — at runtime the schema requires a non-empty
      // region, but the implementation guards `!target?.region` so this
      // case should be handled defensively.
      const targetWithEmptyRegion = {
        name: 'default',
        account: '123456789012',
        region: '',
      } as unknown as AwsDeploymentTarget;

      let observedRegion: string | undefined;
      let observedDefaultRegion: string | undefined;
      let receivedTarget: AwsDeploymentTarget | undefined;

      await runWithTargetRegion(
        () => Promise.resolve(targetWithEmptyRegion),
        target => {
          observedRegion = process.env.AWS_REGION;
          observedDefaultRegion = process.env.AWS_DEFAULT_REGION;
          receivedTarget = target;
          return Promise.resolve();
        }
      );

      // fn still receives the target object even though its region was falsy.
      expect(receivedTarget).toBe(targetWithEmptyRegion);
      // Env was not mutated by the override.
      expect(observedRegion).toBe('us-east-1');
      expect(observedDefaultRegion).toBeUndefined();
      expect(process.env.AWS_REGION).toBe('us-east-1');
      expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
    });

    it('restores env when fn throws', async () => {
      process.env.AWS_REGION = 'us-east-1';

      await expect(
        runWithTargetRegion(
          () => Promise.resolve(makeTarget('eu-west-1')),
          () => {
            expect(process.env.AWS_REGION).toBe('eu-west-1');
            return Promise.reject(new Error('boom'));
          }
        )
      ).rejects.toThrow('boom');

      expect(process.env.AWS_REGION).toBe('us-east-1');
    });

    it('does not mutate env when the resolver itself throws', async () => {
      process.env.AWS_REGION = 'us-east-1';

      await expect(
        runWithTargetRegion(
          () => Promise.reject(new Error('resolve failed')),
          () => Promise.resolve()
        )
      ).rejects.toThrow('resolve failed');

      expect(process.env.AWS_REGION).toBe('us-east-1');
      expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
    });
  });
});
