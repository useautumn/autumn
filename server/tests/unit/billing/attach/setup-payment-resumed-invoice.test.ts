// Red: a resumed pending invoice was logged as "attached successfully" and the setup
// metadata deleted. Green: the webhook rethrows and keeps the metadata for retry.

import { expect, test } from "bun:test";
import {
	AppEnv,
	type BillingResult,
	ErrCode,
	MetadataType,
	RecaseError,
} from "@autumn/shared";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const state = {
	billingResult: undefined as BillingResult | undefined,
	deletedMetadataIds: [] as string[],
	attachCalls: 0,
};

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({}),
}));

await mockModuleWithRestore("@/external/stripe/stripeCusUtils.js", () => ({
	updateDefaultPaymentMethod: async () => ({ id: "pm_1" }),
}));

await mockModuleWithRestore(
	"@/internal/billing/v2/utils/billingLock/withBillingLock.js",
	() => ({
		withBillingLock: async ({ fn }: { fn: () => Promise<unknown> }) => fn(),
	}),
);

await mockModuleWithRestore("@/internal/billing/v2/actions/index.js", () => ({
	billingActions: {
		attach: async () => {
			state.attachCalls += 1;
			return { billingContext: {}, billingResult: state.billingResult };
		},
	},
}));

await mockModuleWithRestore("@/internal/metadata/MetadataService.js", () => ({
	MetadataService: {
		delete: async ({ id }: { id: string }) => {
			state.deletedMetadataIds.push(id);
		},
	},
}));

const { handleSetupPaymentMetadata } = await import(
	"@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleSetupPaymentMetadata.js"
);

const metadataId = "meta_setup";
const ctx = {
	db: {} as never,
	org: { id: "org_1" },
	env: AppEnv.Sandbox,
	logger: { info: () => {}, warn: () => {}, error: () => {} },
} as never;
const checkoutContext = {
	stripeCheckoutSession: { customer: "cus_stripe" },
	metadata: {
		id: metadataId,
		type: MetadataType.SetupPaymentV2,
		data: { params: { customer_id: "cus_1", plan_id: "premium" } },
	},
} as never;

const resetState = () => {
	state.billingResult = undefined;
	state.deletedMetadataIds = [];
	state.attachCalls = 0;
};

test("deletes the setup metadata once the plan attach ran", async () => {
	resetState();
	state.billingResult = { stripe: { stripeInvoice: undefined } };

	await handleSetupPaymentMetadata({ ctx, checkoutContext });

	expect(state.attachCalls).toBe(1);
	expect(state.deletedMetadataIds).toEqual([metadataId]);
});

test("keeps the setup metadata when an earlier pending invoice was resumed", async () => {
	resetState();
	state.billingResult = {
		stripe: { deferred: true, resumedPendingInvoice: true },
	};

	let thrown: unknown;
	try {
		await handleSetupPaymentMetadata({ ctx, checkoutContext });
	} catch (error) {
		thrown = error;
	}

	expect(thrown).toBeInstanceOf(RecaseError);
	expect((thrown as RecaseError).code).toBe(ErrCode.PendingPlanConflict);
	expect(state.deletedMetadataIds).toEqual([]);
});
