import {
	AffectedResource,
	type Checkout,
	type ConfirmCheckoutParams,
	ConfirmCheckoutParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey";
import { checkoutActions } from "../actions";
import { augmentCheckoutParams } from "../utils/augmentCheckoutParams";

/**
 * POST /checkouts/:checkout_id/confirm
 *
 * Executes the billing plan stored in the checkout.
 * - Re-runs attach with the stored params (not preview mode)
 * - Deletes checkout from cache (one-time use)
 * - Updates DB status to completed (audit)
 * - Returns success with billing result
 */
export const handleConfirmCheckout = createRoute({
	scopes: [Scopes.Public],
	resource: AffectedResource.Attach,
	body: ConfirmCheckoutParamsSchema,
	lock:
		process.env.NODE_ENV !== "development"
			? {
					ttlMs: 120000,
					errorMessage:
						"Checkout confirmation already in progress for this customer, try again in a few seconds",
					getKey: (c) => {
						const ctx = c.get("ctx");
						const checkout = c.get("checkout") as Checkout;
						return buildBillingLockKey({
							orgId: ctx.org.id,
							env: ctx.env,
							customerId: checkout.customer_id,
						});
					},
				}
			: undefined,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const checkout = c.get("checkout") as Checkout;
		const body = c.req.valid("json") as ConfirmCheckoutParams;
		const params = augmentCheckoutParams({
			checkout,
			body,
		});
		const response = await checkoutActions.confirm({
			ctx,
			checkout,
			params,
		});

		return c.json(response);
	},
});
