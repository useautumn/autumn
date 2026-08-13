import type { CustomerProductUpdate, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	type BillingChangeCollector,
	collectorToAutumnBillingPlan,
} from "./billingChangeCollector";
import { sendBillingUpdatedWebhook } from "./sendBillingUpdatedWebhook";

/** Fires `billing.updated` for everything a collector accumulated across tasks. */
export const flushBillingUpdated = ({
	ctx,
	collector,
}: {
	ctx: AutumnContext;
	collector: BillingChangeCollector;
}): void => {
	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan: collectorToAutumnBillingPlan(collector),
		originalFullCustomer: collector.originalFullCustomer,
		tags: Array.from(collector.billingChangeTags),
	});
};

/** Fires `billing.updated` for a lifecycle action that owns its single change. */
export const emitBillingUpdated = ({
	ctx,
	originalFullCustomer,
	updateCustomerProducts,
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	updateCustomerProducts: CustomerProductUpdate[];
}): void => {
	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan: {
			customerId: originalFullCustomer.id ?? originalFullCustomer.internal_id,
			insertCustomerProducts: [],
			updateCustomerProducts,
		},
		originalFullCustomer,
	});
};
