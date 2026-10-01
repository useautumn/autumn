import {
	type DeferredAutumnBillingPlanData,
	type Metadata,
	MetadataType,
	notNullish,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeDeferredBillingPlan } from "@/internal/billing/v2/execute/executeDeferredBillingPlan";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey";
import { withBillingLock } from "@/internal/billing/v2/utils/billingLock/withBillingLock";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** invoice.finalized and invoice.paid can both resume the same plan. The lock lease
 * expires if a worker dies, and the re-read skips a plan the other event already applied. */
export const executeDeferredInvoicePlanOnce = async ({
	ctx,
	metadata,
	stripeInvoice,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	metadata: Metadata;
	stripeInvoice?: Stripe.Invoice;
	stripeSubscription?: Stripe.Subscription;
}) => {
	const data = metadata.data as DeferredAutumnBillingPlanData;
	if (data.orgId !== ctx.org.id || data.env !== ctx.env) return;

	const fullCustomer = data.billingContext?.fullCustomer;
	const lockKeys = [fullCustomer?.id, fullCustomer?.internal_id]
		.filter(notNullish)
		.map((customerId) =>
			buildBillingLockKey({ orgId: ctx.org.id, env: ctx.env, customerId }),
		);

	await withBillingLock({
		lockKeys,
		fn: async () => {
			const current = await MetadataService.get({
				db: ctx.db,
				id: metadata.id,
			});

			if (current?.type !== MetadataType.DeferredInvoice) {
				ctx.logger.info(
					`[executeDeferredInvoicePlanOnce] Metadata ${metadata.id} already applied, skipping`,
				);
				return;
			}

			await executeDeferredBillingPlan({
				ctx,
				metadata: current,
				stripeSubscription,
				stripeInvoice,
			});
		},
	});
};
