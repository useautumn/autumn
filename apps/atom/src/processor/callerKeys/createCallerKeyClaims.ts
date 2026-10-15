import type { Journal } from "../../state/journal/types/journal.js";
import { DuplicateIdempotencyKeyError } from "./duplicateIdempotencyKeyError.js";

/** A caller's key as the worker's claim names it (the journal row), and as the caller sent it (the 409). */
export type CallerKey = { claim: string; sent: string };

/**
 * The owner thread's claims on callers' keys, per customer: a key is claimed in the same turn it is checked and held
 * until its request settles, so a twin in flight is a duplicate before anything runs. A request that ends in no append
 * leaves no row, so settling it frees the key for the caller's retry.
 */
export type CallerKeyClaims = {
	/** A keyless request just runs. */
	run<T>(params: {
		customerId: string;
		key: CallerKey | null;
		run: () => Promise<T>;
	}): Promise<T>;
};

export const createCallerKeyClaims = ({
	journal,
}: {
	journal: Pick<Journal, "holdsKey">;
}): CallerKeyClaims => {
	const inFlight = new Map<string, Set<string>>();

	function hold({ customerId, claim }: { customerId: string; claim: string }) {
		const claims = inFlight.get(customerId);
		if (claims) claims.add(claim);
		else inFlight.set(customerId, new Set([claim]));
	}

	function release({
		customerId,
		claim,
	}: {
		customerId: string;
		claim: string;
	}) {
		const claims = inFlight.get(customerId);
		claims?.delete(claim);
		if (claims?.size === 0) inFlight.delete(customerId);
	}

	function isHeld({
		customerId,
		claim,
	}: {
		customerId: string;
		claim: string;
	}): boolean {
		return (
			inFlight.get(customerId)?.has(claim) === true ||
			journal.holdsKey({ customerId, key: claim })
		);
	}

	return {
		run: async ({ customerId, key, run }) => {
			if (!key) return run();
			// No await before the hold: a twin dispatched in the same turn sees this one's claim.
			if (isHeld({ customerId, claim: key.claim }))
				throw new DuplicateIdempotencyKeyError({ key: key.sent });
			hold({ customerId, claim: key.claim });
			try {
				return await run();
			} finally {
				release({ customerId, claim: key.claim });
			}
		},
	};
};
