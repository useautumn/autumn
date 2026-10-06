import {
	type Customer,
	type CustomerData,
	ProcessorType,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { autoSyncStripeCustomer } from "@/internal/billing/v2/actions/sync/autoSyncStripeCustomer.js";
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
	processor: Customer["processor"];
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

/** Link and import as one step: a failed import unlinks again, so a retry of the same `stripe_id` imports. */
const linkAndImport = async ({
	ctx,
	customer,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	customer: Customer;
	stripeCustomerId: string;
}) => {
	const customerId = customer.id ?? customer.internal_id;
	const processor = { id: stripeCustomerId, type: ProcessorType.Stripe };
	await writeProcessor({ ctx, customer, processor });
	try {
		await autoSyncStripeCustomer({ ctx, customerId, stripeCustomerId });
	} catch (error) {
		await writeProcessor({
			ctx,
			customer: { ...customer, processor },
			processor: null,
		});
		throw error;
	}
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

	// Reject an unknown Stripe customer before the link is written.
	await createStripeCli({ org: ctx.org, env: ctx.env }).customers.retrieve(
		stripeCustomerId,
	);

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
