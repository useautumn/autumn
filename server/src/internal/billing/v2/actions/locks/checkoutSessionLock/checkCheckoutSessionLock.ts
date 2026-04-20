import type { BillingContext, BillingPlan } from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { CreateAutumnCheckoutResult } from "@/internal/billing/v2/common/createAutumnCheckout";
import { hashJson } from "@/utils/hash/hashJson";
import { checkoutSessionLock } from "./checkoutSessionLock";

/**
 * Check the checkout session lock for a customer.
 *
 * - Same params + stripe_checkout → returns cached checkout result
 * - Different params + stripe_checkout → expires old session, returns null (proceed)
 * - Lock exists + non-checkout mode → throws 423
 * - No lock → returns null (proceed)
 */
export const checkCheckoutSessionLock = async <T extends BillingContext>({
	ctx,
	params,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	params: unknown;
	billingContext: T;
	billingPlan: BillingPlan;
}): Promise<CreateAutumnCheckoutResult<T> | null> => {
	const customerId =
		billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id;
	const paramsHash = hashJson({ value: params });
	const existingLock = await checkoutSessionLock.get({ ctx, customerId });
	if (!existingLock) return null;

	if (billingContext.checkoutMode === "stripe_checkout") {
		if (existingLock.paramsHash === paramsHash) {
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
							id: existingLock.checkoutSessionId,
							url: existingLock.checkoutSessionUrl,
						},
					},
				},
			};
		}

		ctx.logger.info(
			`Expiring old checkout session ${existingLock.checkoutSessionId} for customer ${customerId} (params changed)`,
		);
		await checkoutSessionLock.expireAndClear({
			ctx,
			customerId,
			checkoutSessionId: existingLock.checkoutSessionId,
		});
		return null;
	}

	ctx.logger.info(
		`Blocking non-checkout billing action for customer ${customerId} — checkout session ${existingLock.checkoutSessionId} still active`,
	);
	throw new RecaseError({
		message: "A checkout session is already in progress for this customer",
		code: ErrCode.LockAlreadyExists,
		statusCode: 423,
	});
};
