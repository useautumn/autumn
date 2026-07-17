import {
	type EntInterval,
	InternalError,
	PooledBalanceResetMode,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getResetAtUpdate } from "@/internal/customers/actions/resetCustomerEntitlements/getResetAtUpdate.js";

/**
 * Advances a pooled reset on the same calendar as the owner that drives it.
 *
 * Lazy/free pools reuse the canonical customer-entitlement transition so
 * clamped month-end dates and late catch-up behave exactly like standard
 * balances. Subscription pools use the already-expanded Stripe invoice's
 * period end; recomputing from a stored anchor can disagree with Stripe.
 */
export const getNextPooledBalanceResetAt = async ({
	ctx,
	resetMode,
	currentResetAt,
	interval,
	intervalCount,
	subscriptionNextResetAt,
}: {
	ctx: AutumnContext;
	resetMode: PooledBalanceResetMode;
	currentResetAt: number;
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

	return getResetAtUpdate({
		curResetAt: currentResetAt,
		interval,
		intervalCount,
		cusProduct: null,
		org: ctx.org,
		env: ctx.env,
	});
};
