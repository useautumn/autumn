import {
	type EntInterval,
	getCycleEnd,
	InternalError,
	PooledBalanceResetMode,
} from "@autumn/shared";

/** Lazy pools advance from their stored anchor; subscription pools use Stripe's exact period end. */
export const getNextPooledBalanceResetAt = async ({
	resetMode,
	currentResetAt,
	resetCycleAnchor,
	asOf = currentResetAt,
	interval,
	intervalCount,
	subscriptionNextResetAt,
}: {
	resetMode: PooledBalanceResetMode;
	currentResetAt: number;
	resetCycleAnchor?: number;
	asOf?: number;
	interval: EntInterval;
	intervalCount: number;
	subscriptionNextResetAt?: number;
}): Promise<number | null> => {
	if (resetMode === PooledBalanceResetMode.Subscription) {
		if (
			typeof subscriptionNextResetAt !== "number" ||
			!Number.isFinite(subscriptionNextResetAt)
		) {
			throw new InternalError({
				message:
					"Subscription pooled reset requires a Stripe-aligned next reset boundary.",
			});
		}
		if (subscriptionNextResetAt <= currentResetAt) {
			return null;
		}
		return subscriptionNextResetAt;
	}

	if (resetMode === PooledBalanceResetMode.Lifetime) {
		throw new InternalError({
			message: "Lifetime pooled balances do not have a next reset boundary.",
		});
	}

	if (
		typeof resetCycleAnchor !== "number" ||
		!Number.isFinite(resetCycleAnchor)
	) {
		throw new InternalError({
			message: "Lazy pooled reset requires a finite reset cycle anchor.",
		});
	}
	if (!Number.isFinite(asOf)) {
		throw new InternalError({
			message: "Lazy pooled reset requires a finite as-of timestamp.",
		});
	}

	return getCycleEnd({
		anchor: resetCycleAnchor,
		interval,
		intervalCount,
		now: Math.max(currentResetAt, asOf),
	});
};
