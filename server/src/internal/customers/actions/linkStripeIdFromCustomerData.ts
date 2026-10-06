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

const writeProcessor = async ({
	ctx,
	customer,
	processor,
}: {
	ctx: AutumnContext;
	customer: Customer;
	processor: NonNullable<Customer["processor"]>;
}) => {
	const customerId = customer.id ?? customer.internal_id;
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId,
			insertCustomerProducts: [],
			updateCustomer: { customer, updates: { processor } },
		},
	});
	await updateCachedCustomerData({ ctx, customerId, updates: { processor } });
};

/** The customer row as committed, after the worker lands any link a concurrent request wrote. */
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

/** Another customer already linked to this Stripe customer would split its webhooks between two accounts. */
const isLinkedToAnotherCustomer = async ({
	ctx,
	customer,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	customer: Customer;
	stripeCustomerId: string;
}) => {
	const owner = await CusService.getByStripeId({
		ctx,
		stripeId: stripeCustomerId,
	});
	return Boolean(owner && owner.internal_id !== customer.internal_id);
};

/** Stripe reads first, so a failed read leaves the customer unlinked and a retry imports; imported rows keep the link webhooks need. */
const linkAndImport = async ({
	ctx,
	customer,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	customer: Customer;
	stripeCustomerId: string;
}) => {
	const syncCandidates = await prepareAutoSyncStripeCustomer({
		ctx,
		customerId: customer.id ?? customer.internal_id,
		stripeCustomerId,
	});
	await writeProcessor({
		ctx,
		customer,
		processor: { id: stripeCustomerId, type: ProcessorType.Stripe },
	});
	await syncAutoSyncCandidates({ ctx, syncCandidates });
};

/** Links an existing, unlinked customer to the `stripe_id` it is sent and imports that Stripe customer's billing, as creation does. */
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
	const skipLink = (reason: string) => {
		ctx.logger.warn(
			`[linkStripeIdFromCustomerData] not linking ${customerId} to ${stripeCustomerId}: ${reason}`,
		);
		return false;
	};
	if (customer.processor?.id)
		return skipLink(`already linked to ${customer.processor.id}`);

	return withStripeSyncCustomerLock({
		ctx,
		customerId,
		run: async () => {
			const committed = await readCommittedCustomer({ ctx, customerId });
			if (!committed) return false;
			const linkedId = committed.processor?.id;
			if (linkedId === stripeCustomerId) {
				Object.assign(customer, { processor: committed.processor });
				return true;
			}
			if (linkedId) return skipLink(`already linked to ${linkedId}`);
			if (
				await isLinkedToAnotherCustomer({
					ctx,
					customer: committed,
					stripeCustomerId,
				})
			)
				return skipLink("another customer is linked to it");

			await linkAndImport({ ctx, customer: committed, stripeCustomerId });
			Object.assign(customer, {
				processor: { id: stripeCustomerId, type: ProcessorType.Stripe },
			});
			return true;
		},
	});
};
