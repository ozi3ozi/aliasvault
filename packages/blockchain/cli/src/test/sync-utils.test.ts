import { describe, it, expect } from 'vitest';
import { isProgressSynced, isWalletSynced, resolvePrivateStatePassword } from '../sync-utils';

// v2 SyncProgress (shielded/dust): appliedIndex / highestRelevantWalletIndex
const v2 = (applied: bigint, target: bigint, connected: boolean) => ({
    appliedIndex: applied,
    highestRelevantWalletIndex: target,
    isStrictlyComplete: () => connected && applied === target,
});
// v1 SyncProgress (unshielded): appliedId / highestTransactionId
const v1 = (applied: bigint, target: bigint, connected: boolean) => ({
    appliedId: applied,
    highestTransactionId: target,
    isStrictlyComplete: () => connected && applied === target,
});

describe('isProgressSynced', () => {
    it('true when strictly complete (connected + caught up)', () => {
        expect(isProgressSynced(v2(5n, 5n, true))).toBe(true);
        expect(isProgressSynced(v1(5n, 5n, true))).toBe(true);
    });

    it('false when caught up but disconnected with real history (not 0/0)', () => {
        expect(isProgressSynced(v2(5n, 5n, false))).toBe(false);
    });

    it('false mid-sync', () => {
        expect(isProgressSynced(v2(3n, 5n, true))).toBe(false);
        expect(isProgressSynced(v2(0n, 5n, true))).toBe(false);
    });

    it('0/0 escape: true even when disconnected (nothing to sync) — v2 fields', () => {
        expect(isProgressSynced(v2(0n, 0n, false))).toBe(true);
    });

    it('0/0 escape works for the v1 (unshielded) field shape too (review #6)', () => {
        // Regression guard: the escape was previously dead for unshielded because it
        // only checked appliedIndex/highestRelevantWalletIndex (undefined for v1).
        expect(isProgressSynced(v1(0n, 0n, false))).toBe(true);
    });
});

describe('isWalletSynced', () => {
    const facadeState = (
        shielded: ReturnType<typeof v2>,
        dust: ReturnType<typeof v2>,
        unshielded: ReturnType<typeof v1>,
    ) => ({
        shielded: { state: { progress: shielded } },
        dust: { state: { progress: dust } },
        unshielded: { progress: unshielded },
    });

    it('true for the genesis-wallet shape: empty shielded/dust (0/0) + funded unshielded synced', () => {
        expect(isWalletSynced(facadeState(v2(0n, 0n, false), v2(0n, 0n, false), v1(8n, 8n, true)))).toBe(true);
    });

    it('false while the funded (unshielded) sub-wallet is still mid-sync', () => {
        expect(isWalletSynced(facadeState(v2(0n, 0n, false), v2(0n, 0n, false), v1(3n, 8n, true)))).toBe(false);
    });

    it('false when one sub-wallet is caught-up-but-disconnected with history', () => {
        expect(isWalletSynced(facadeState(v2(5n, 5n, false), v2(0n, 0n, false), v1(8n, 8n, true)))).toBe(false);
    });
});

describe('resolvePrivateStatePassword (security gate, review #2)', () => {
    const dev = 'AliasVault-CLI-Dev-Password-DoNotUseInProduction-1';

    it('returns the env override when set, on any network', () => {
        expect(resolvePrivateStatePassword('mainnet', 'env-secret', dev)).toBe('env-secret');
        expect(resolvePrivateStatePassword('undeployed', 'env-secret', dev)).toBe('env-secret');
    });

    it('returns the dev default only on the local undeployed network', () => {
        expect(resolvePrivateStatePassword('undeployed', undefined, dev)).toBe(dev);
        expect(resolvePrivateStatePassword('undeployed', '', dev)).toBe(dev);
    });

    it('throws on any non-local network when no env password is set', () => {
        for (const net of ['preprod', 'preview', 'mainnet', 'testnet']) {
            expect(() => resolvePrivateStatePassword(net, undefined, dev)).toThrow(/MIDNIGHT_PRIVATE_STATE_PASSWORD/);
        }
    });
});
