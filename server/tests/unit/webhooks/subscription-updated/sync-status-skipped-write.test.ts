/**
 * sub.updated status sync must only track and notify rows it actually wrote. A row another
 * request expired after the webhook loaded its customer view is skipped by the status guard.
 *
 * Red (before):  the skipped row is still tracked and sent a past_due webhook
 * Green (after): nothing is tracked or sent for a write that changed no row
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { makeFullCusProduct } from "../../billing/billing-change-response/helpers/makeFullCusProduct.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const STRIPE_SUBSCRIPTION_ID = "sub_status_guard";

const state = {
	updatedRows: [] as { internal_customer_id: string }[],
	trackedIds: [] as string[],
	webhookScenarios: [] as string[],
};

await mockModuleWithRestore(
	"@/internal/customers/cusProducts/CusProductService.js",
	() => ({
		CusProductService: {
			update: async () => state.updatedRows,
			updateByStripeSubId: async () => [],
		},
	}),
);

await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/common/trackCustomerProductUpdate.js",
	() => ({
		trackCustomerProductUpdate: ({
			customerProduct,
		}: {
			customerProduct: { id: string };
		}) => {
			state.trackedIds.push(customerProduct.id);
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/analytics/handlers/handleProductsUpdated.js",
	() => ({
		addProductsUpdatedWebhookTask: async ({
			scenario,
		}: {
			scenario: string;
		}) => {
			state.webhookScenarios.push(scenario);
		},
	}),
);

const { syncCustomerProductStatus } = await import(
	"@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/syncCustomerProductStatus/syncCustomerProductStatus.js"
);

const runSyncToPastDue = () => {
	const customerProduct = {
		...makeFullCusProduct({ planId: "pro", status: CusProductStatus.Active }),
		subscription_ids: [STRIPE_SUBSCRIPTION_ID],
	};

	return syncCustomerProductStatus({
		ctx: {
			db: {},
			logger: { debug: () => {}, info: () => {}, warn: () => {} },
			org: { id: "org_status_guard", config: { sync_status: true } },
			env: "sandbox",
		} as never,
		subscriptionUpdatedContext: {
			stripeSubscription: {
				id: STRIPE_SUBSCRIPTION_ID,
				status: "past_due",
				collection_method: "charge_automatically",
			},
			customerProducts: [customerProduct],
			fullCustomer: { internal_id: "internal_cus_test", id: "cus_test" },
			previousAttributes: { status: "past_due" },
		} as never,
	});
};

test("a status write that changed no row is not tracked or notified", async () => {
	state.updatedRows = [];
	state.trackedIds = [];
	state.webhookScenarios = [];

	await runSyncToPastDue();

	expect(state.trackedIds).toEqual([]);
	expect(state.webhookScenarios).toEqual([]);
});

test("a status write that changed a row is tracked and notified", async () => {
	state.updatedRows = [{ internal_customer_id: "internal_cus_test" }];
	state.trackedIds = [];
	state.webhookScenarios = [];

	await runSyncToPastDue();

	expect(state.trackedIds).toEqual(["cp_pro"]);
	expect(state.webhookScenarios).toHaveLength(1);
});
