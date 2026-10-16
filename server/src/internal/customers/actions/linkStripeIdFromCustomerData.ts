import {
	type Customer,
	type CustomerData,
	ProcessorType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { syncAutoSyncCandidates } from "@/internal/billing/v2/actions/sync/autoSyncStripeCustomer.js";
import { prepareAutoSyncStripeCustomer } from "@/internal/billing/v2/actions/sync/setup/prepareAutoSyncStripeCustomer.js";
import { withStripeSyncCustomerLock } from "@/internal/billing/v2/actions/sync/utils/withStripeSyncCustomerLock.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { CusService } from "@/internal/customers/CusService.js";
import { updateCachedCustomerData } from "@/internal/customers/cache/fullSubject/actions/updateCachedCustomerData.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

/** The committed row, after the worker lands any link a concurrent request wrote. */
const readCommittedCustomer = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => {
	if (isBalanceWorkerRolloutEnabled({ ctx, customerId }))
		await flushBalanceWorkerCustomer({ ctx, customerId });
	return CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
};

/** Links an existing customer with no Stripe customer to the `stripe_id` it is sent and imports its billing, as creation does. Resolves whether it linked. */
export const linkStripeIdFromCustomerData = async ({
	ctx,
	customer,
	customerData,
}: {
	ctx: AutumnContext;
	customer: Customer;
	customerData?: CustomerData;
}): Promise<boolean> => {
	const stripeCustomerId = customerData?.stripe_id;
	if (!stripeCustomerId || customer.processor?.id === stripeCustomerId)
		return false;

	const customerId = customer.id ?? customer.internal_id;
	const skip = (reason: string) => {
		ctx.logger.warn(
			`[linkStripeIdFromCustomerData] not linking ${customerId} to ${stripeCustomerId}: ${reason}`,
		);
		return false;
	};
	if (customer.processor?.id)
		return skip(`already linked to ${customer.processor.id}`);

	return withStripeSyncCustomerLock({
		ctx,
		customerId,
		run: async () => {
			const committed = await readCommittedCustomer({ ctx, customerId });
			if (!committed) return false;
			if (committed.processor?.id === stripeCustomerId) return true;
			if (committed.processor?.id)
				return skip(`already linked to ${committed.processor.id}`);
			const owner = await CusService.getByStripeId({
				ctx,
				stripeId: stripeCustomerId,
			});
			if (owner && owner.internal_id !== committed.internal_id)
				return skip("another customer is linked to it");

			// Stripe reads first, so a failed read leaves the customer unlinked for a retry.
			const syncCandidates = await prepareAutoSyncStripeCustomer({
				ctx,
				customerId,
				stripeCustomerId,
			});
			const processor = { id: stripeCustomerId, type: ProcessorType.Stripe };
			await executeAutumnBillingPlan({
				ctx,
				autumnBillingPlan: {
					customerId,
					insertCustomerProducts: [],
					updateCustomer: { customer: committed, updates: { processor } },
				},
			});
			await updateCachedCustomerData({
				ctx,
				customerId,
				updates: { processor },
			});
			await syncAutoSyncCandidates({ ctx, syncCandidates });
			return true;
		},
	});
};
