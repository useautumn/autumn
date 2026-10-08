import { autoTopupLimitStates } from "@autumn/shared";
import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { DELAYED_PAYMENT_SUSPENDED_REASON } from "../helpers/delayedPaymentMethods.js";

/**
 * Clears the circuit breaker on every feature for a customer. Called when a
 * payment succeeds — the strongest signal that the customer's billing is
 * working again.
 */
export const clearAutoTopupSuspensions = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
}) => {
	const { db, org, env } = ctx;

	const cleared = await db
		.update(autoTopupLimitStates)
		.set({
			consecutive_failure_count: 0,
			suspended_at: null,
			suspended_reason: null,
			suspended_payment_method_fingerprint: null,
			updated_at: Date.now(),
		})
		.where(
			and(
				eq(autoTopupLimitStates.org_id, org.id),
				eq(autoTopupLimitStates.env, env),
				eq(autoTopupLimitStates.internal_customer_id, internalCustomerId),
				isNotNull(autoTopupLimitStates.suspended_at),
				// Settling the slow charge doesn't make the method fast; only a new PM lifts it.
				or(
					isNull(autoTopupLimitStates.suspended_reason),
					ne(
						autoTopupLimitStates.suspended_reason,
						DELAYED_PAYMENT_SUSPENDED_REASON,
					),
				),
			),
		)
		.returning({ id: autoTopupLimitStates.id });

	return cleared.length;
};
