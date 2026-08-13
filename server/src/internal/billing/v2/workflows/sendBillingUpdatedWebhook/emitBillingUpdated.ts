import type {
	CustomerProductUpdate,
	FullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	type BillingChangeCollector,
	collectorToAutumnBillingPlan,
	createBillingChangeCollector,
} from "./billingChangeCollector";
import { sendBillingUpdatedWebhook } from "./sendBillingUpdatedWebhook";

/**
 * Central emission point for `billing.updated`. Builds the AutumnBillingPlan
 * from a collector's tracked mutations and fires the webhook fire-and-forget.
 */
export const flushBillingUpdated = ({
	ctx,
	collector,
}: {
	ctx: AutumnContext;
	collector: BillingChangeCollector;
}): void => {
	const autumnBillingPlan = collectorToAutumnBillingPlan(collector);
	const tags = Array.from(collector.billingChangeTags);

	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan,
		originalFullCustomer: collector.originalFullCustomer,
		tags,
	});
};

/** One-shot emission for callers that don't accumulate changes across tasks. */
export const emitBillingUpdated = ({
	ctx,
	originalFullCustomer,
	updateCustomerProducts = [],
	insertCustomerProducts = [],
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	updateCustomerProducts?: CustomerProductUpdate[];
	insertCustomerProducts?: FullCusProduct[];
}): void => {
	const collector = createBillingChangeCollector({
		fullCustomer: originalFullCustomer,
	});

	collector.updatedCustomerProducts.push(...updateCustomerProducts);
	collector.insertedCustomerProducts.push(...insertCustomerProducts);

	flushBillingUpdated({ ctx, collector });
};
