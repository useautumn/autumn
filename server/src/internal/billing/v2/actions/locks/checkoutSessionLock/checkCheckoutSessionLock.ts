import type { BillingContext, BillingPlan } from "@autumn/shared";
import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { CreateAutumnCheckoutResult } from "@/internal/billing/v2/common/createAutumnCheckout";
import { hashJson } from "@/utils/hash/hashJson";
import {
	checkoutSessionLock,
	type CheckoutSessionLockData,
} from "./checkoutSessionLock";

/** Reuses matching Checkout sessions and prevents a payable session from racing direct billing. */
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

	if (billingContext.checkoutMode === "stripe_checkout") {
		ctx.logger.info(
			`Expiring old checkout session ${lock.checkoutSessionId} for customer ${customerId} (params changed)`,
		);
		await checkoutSessionLock.expireAndClearIfOwned({
			ctx,
			customerId,
			checkoutSessionId: lock.checkoutSessionId,
		});
		return null;
	}

	if (ctx.env === AppEnv.Sandbox) {
		ctx.logger.info(
			`Sandbox: clearing checkout session lock for customer ${customerId} (session ${lock.checkoutSessionId}) to allow non-checkout billing action`,
		);
		await checkoutSessionLock.expireAndClearIfOwned({
			ctx,
			customerId,
			checkoutSessionId: lock.checkoutSessionId,
		});
		return null;
	}

	ctx.logger.info(
		`Blocking non-checkout billing action for customer ${customerId} — checkout session ${lock.checkoutSessionId} still active`,
	);
	throw new RecaseError({
		message: "A checkout session is already in progress for this customer",
		code: ErrCode.LockAlreadyExists,
		statusCode: 423,
	});
};
