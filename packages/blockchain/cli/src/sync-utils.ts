/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// Pure, dependency-free wallet-sync + private-state helpers, extracted from api.ts so
// they can be unit-tested in isolation. (api.ts can't be imported in a unit test: its
// top-level CompiledContract.make() needs the real contract config / zk assets.)

/**
 * A sub-wallet's SyncProgress. The shielded/dust sub-wallets use v2 SyncProgress
 * (`appliedIndex`/`highestRelevantWalletIndex`); the unshielded sub-wallet uses v1
 * (`appliedId`/`highestTransactionId`).
 */
export interface SyncProgressLike {
    isStrictlyComplete: () => boolean;
    appliedIndex?: bigint;
    highestRelevantWalletIndex?: bigint;
    appliedId?: bigint;
    highestTransactionId?: bigint;
}

/**
 * Whether one sub-wallet's SyncProgress is "done". `isStrictlyComplete()` requires
 * `isConnected && applied === highest`. On a fresh undeployed devnet, a sub-wallet with
 * no relevant history (e.g. shielded/dust for the genesis wallet) sits at 0/0 and may
 * never report `isConnected`, which would hang sync forever — so we also accept the 0/0
 * "nothing to sync" case, checking both the v1 and v2 field shapes.
 *
 * CAVEAT: the 0/0 path intentionally ignores `isConnected`. On a network with real
 * history this could in principle resolve on a pre-sync 0/0 snapshot; in the CLI flows
 * the `balance > 0n` filter in waitForFunds/waitForDust is the funded-read backstop.
 * Re-verify against a funded preview/preprod wallet before any non-local deploy.
 * (See story 6.5c review issue #3.)
 */
export const isProgressSynced = (progress: SyncProgressLike): boolean => {
    if (progress.isStrictlyComplete()) return true;
    const applied = progress.appliedIndex ?? progress.appliedId;
    const target = progress.highestRelevantWalletIndex ?? progress.highestTransactionId;
    return applied === 0n && target === 0n;
};

/** 0/0-aware equivalent of FacadeState.isSynced across all three sub-wallets. The real
 *  FacadeState .d.ts does not expose `.state.progress`, so the param is loosely typed. */
export const isWalletSynced = (state: any): boolean =>
    isProgressSynced(state.shielded.state.progress) &&
    isProgressSynced(state.dust.state.progress) &&
    isProgressSynced(state.unshielded.progress);

/**
 * Resolve the private-state-store password. Returns the env override if set; otherwise
 * the dev default ONLY on the local `undeployed` network — on any real network it throws,
 * because the store encrypts contract secret keys at rest and must not be protected by a
 * shared dev default. (Story 6.5c review issue #2.)
 */
export const resolvePrivateStatePassword = (
    networkId: string,
    envPassword: string | undefined,
    devPassword: string,
): string => {
    if (envPassword) return envPassword;
    if (networkId !== 'undeployed') {
        throw new Error(
            'MIDNIGHT_PRIVATE_STATE_PASSWORD must be set for non-local networks: the ' +
                'private-state store encrypts contract secret keys at rest and the built-in ' +
                'dev default must not protect production data.',
        );
    }
    return devPassword;
};
