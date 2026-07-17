import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { customerProductToPooledBalanceRemovalOp } from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

/**
 * checkout.session.expired handler — cleans up cusProduct rows that were
 * pre-inserted under the enable_plan_immediately flow but never got their
 * subscription linked because the customer abandoned the checkout.
 *
 * Identifies rows by stripe_checkout_session_id. Skips any row that has
 * subscription_ids populated (already completed via the success path).
 */
export const handleStripeCheckoutSessionExpired = async ({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.CheckoutSessionExpiredEvent;
}) => {
	const session = event.data.object;

	const cusProducts = await CusProductService.getByStripeCheckoutSessionId({
		db: ctx.db,
		stripeCheckoutSessionId: session.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	if (cusProducts.length === 0) {
		// Try to clean up the metadata row even if no cusProduct ever got created
		// (e.g. a deferred-flow checkout that expired).
		if (session.metadata?.autumn_metadata_id) {
			await MetadataService.delete({
				db: ctx.db,
				id: session.metadata.autumn_metadata_id,
			});
		}
		return;
	}

	const abandonedCustomerProducts = cusProducts.filter(
		(customerProduct) => (customerProduct.subscription_ids ?? []).length === 0,
	);
	const customerProductsByInternalCustomerId = new Map<
		string,
		FullCusProduct[]
	>();
	for (const customerProduct of abandonedCustomerProducts) {
		const internalCustomerId = customerProduct.internal_customer_id;
		customerProductsByInternalCustomerId.set(internalCustomerId, [
			...(customerProductsByInternalCustomerId.get(internalCustomerId) ?? []),
			customerProduct,
		]);
	}

	for (const [
		internalCustomerId,
		customerProducts,
	] of customerProductsByInternalCustomerId) {
		const now = Date.now();
		const pooledBalanceOps = customerProducts.flatMap((customerProduct) => {
			const operation = customerProductToPooledBalanceRemovalOp({
				customerProduct,
				effectiveAt: null,
			});
			return operation ? [operation] : [];
		});

		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: {
				customerId: internalCustomerId,
				insertCustomerProducts: [],
				updateCustomerProducts: customerProducts.map((customerProduct) => ({
					customerProduct,
					updates: {
						status: CusProductStatus.Expired,
						ended_at: now,
					},
				})),
				pooledBalanceOps,
			},
		});
	}

	if (session.metadata?.autumn_metadata_id) {
		await MetadataService.delete({
			db: ctx.db,
			id: session.metadata.autumn_metadata_id,
		});
	}

	ctx.logger.info(
		`[checkout.session.expired] Expired ${abandonedCustomerProducts.length} cusProduct(s) linked to ${session.id}`,
	);
};
