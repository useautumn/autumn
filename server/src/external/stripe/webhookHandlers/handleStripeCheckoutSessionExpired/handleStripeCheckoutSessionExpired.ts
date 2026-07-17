import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { withCustomerBalanceSyncLock } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import {
	applyPreparedPooledBalanceCacheCutover,
	executePooledBalanceOps,
} from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
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

	let expiredCustomerProductCount = 0;
	for (const internalCustomerId of customerProductsByInternalCustomerId.keys()) {
		const now = Date.now();
		const { expiredCount, preparedCutover } = await withCustomerBalanceSyncLock(
			{
				ctx,
				customerId: internalCustomerId,
				internalCustomerId,
				callback: async ({ db }) => {
					const currentCustomerProducts =
						await CusProductService.getByStripeCheckoutSessionId({
							db,
							stripeCheckoutSessionId: session.id,
							orgId: ctx.org.id,
							env: ctx.env,
						});
					const currentAbandonedCustomerProducts =
						currentCustomerProducts.filter(
							(customerProduct) =>
								customerProduct.internal_customer_id === internalCustomerId &&
								(customerProduct.subscription_ids ?? []).length === 0,
						);
					if (currentAbandonedCustomerProducts.length === 0) {
						return { expiredCount: 0, preparedCutover: undefined };
					}

					const pooledBalanceOps = currentAbandonedCustomerProducts.flatMap(
						(customerProduct) => {
							const operation = customerProductToPooledBalanceRemovalOp({
								customerProduct,
								effectiveAt: null,
							});
							return operation ? [operation] : [];
						},
					);
					const transactionContext = { ...ctx, db };
					const preparedCutover = await executePooledBalanceOps({
						ctx: transactionContext,
						customerId: internalCustomerId,
						balanceSyncDb: db,
						pooledBalanceOps,
						beforeDatabaseOperations: async () => {
							for (const customerProduct of currentAbandonedCustomerProducts) {
								await CusProductService.update({
									ctx: transactionContext,
									cusProductId: customerProduct.id,
									updates: {
										status: CusProductStatus.Expired,
										ended_at: now,
									},
								});
							}
						},
					});
					return {
						expiredCount: currentAbandonedCustomerProducts.length,
						preparedCutover,
					};
				},
			},
		);
		if (preparedCutover) {
			await applyPreparedPooledBalanceCacheCutover({
				ctx,
				prepared: preparedCutover,
			});
		}
		expiredCustomerProductCount += expiredCount;
	}

	if (session.metadata?.autumn_metadata_id) {
		await MetadataService.delete({
			db: ctx.db,
			id: session.metadata.autumn_metadata_id,
		});
	}

	ctx.logger.info(
		`[checkout.session.expired] Expired ${expiredCustomerProductCount} cusProduct(s) linked to ${session.id}`,
	);
};
