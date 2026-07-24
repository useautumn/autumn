import type { BillingContext, BillingPlan } from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { CreateAutumnCheckoutResult } from "@/internal/billing/v2/common/createAutumnCheckout";
import { hashJson } from "@/utils/hash/hashJson";
import {
	type CheckoutSessionLockData,
	checkoutSessionLock,
} from "./checkoutSessionLock";

/** Same params → reuse the pending session. Different params → expire it via Stripe
 * and proceed, or 423 when the session already won the race (paid/completing). */
export const checkCheckoutSessionLock = async <T extends BillingContext>({
	ctx,
	params,
	billingContext,
	billingPlan,
	existingLock,
}: {
	ctx: AutumnContext;
	params: unknown;
	billingContext: T;
	billingPlan: BillingPlan;
	existingLock?: CheckoutSessionLockData | null;
}): Promise<CreateAutumnCheckoutResult<T> | null> => {
	const customerId =
		billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id;
	const paramsHash = hashJson({ value: params });
	// Entry-time snapshot wins when present; a null snapshot (e.g. caller passed
	// internal_id, reservation keyed on public id) falls back to the canonical key.
	const lock =
		existingLock ?? (await checkoutSessionLock.get({ ctx, customerId }));
	if (!lock) return null;

	if (lock.paramsHash === paramsHash) {
		ctx.logger.info(
			`Returning cached checkout session for customer ${customerId}`,
		);
		return {
			billingContext,
			billingPlan,
			billingResult: {
				stripe: {
					deferred: true,
					stripeCheckoutSession: {
						id: lock.checkoutSessionId,
						url: lock.checkoutSessionUrl,
					},
				},
			},
		};
	}

	const cleared = await checkoutSessionLock.expireAndClearIfOwned({
		ctx,
		customerId,
		checkoutSessionId: lock.checkoutSessionId,
	});

	if (cleared) {
		ctx.logger.info(
			`Expired checkout session ${lock.checkoutSessionId} for customer ${customerId} (params changed)`,
		);
		return null;
	}

	ctx.logger.info(
		`Blocking billing action for customer ${customerId} — checkout session ${lock.checkoutSessionId} completed and is materializing`,
	);
	throw new RecaseError({
		message:
			"A checkout session for this customer was just completed and is still being processed",
		code: ErrCode.LockAlreadyExists,
		statusCode: 423,
	});
};
