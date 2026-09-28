import {
	claimIdempotencyKey,
	releaseIdempotencyKey,
} from "./repos/idempotencyKeys.js";
import type {
	IdempotencyClaim,
	IdempotencyKeyStore,
	IdempotencyKeysContext,
} from "./types/idempotencyKey.js";

export const createIdempotencyKeyStore = ({
	ctx,
}: {
	ctx: IdempotencyKeysContext;
}): IdempotencyKeyStore => {
	const claim = (claim: IdempotencyClaim) =>
		claimIdempotencyKey({ ctx, claim });
	const release = (params: { storageKey: string; owner?: string }) =>
		releaseIdempotencyKey({ ctx, ...params });
	return { claim, release };
};
