/**
 * Deferred invoice plans are only given up when the invoice has no payment at all.
 *
 * Contract:
 *   cron, open + unpaid             → void, expire pending, cancel created sub, delete metadata
 *   cron, uncollectible + unpaid    → void first (still payable), then expire like open
 *   cron, open + partially paid     → untouched, expires_at cleared so the cron stops re-picking it
 *   cron, void + partially paid     → untouched, expires_at cleared
 *   void webhook, partially paid    → pending plan untouched
 *   sub cancel fails                → metadata kept so the next cron run retries
 *   sub already canceled / expired  → not canceled again, metadata deleted
 */

import { expect, test } from "bun:test";
import { AppEnv, type Metadata, MetadataType } from "@autumn/shared";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const STRIPE_SUBSCRIPTION_ID = "sub_deferred_created";

type InvoiceStatus = "open" | "uncollectible" | "void";

const state = {
	invoiceStatus: "open" as InvoiceStatus,
	amountPaid: 0,
	subscriptionStatus: "active" as "active" | "canceled" | "incomplete_expired",
	cancelFails: false,
	voidedInvoiceIds: [] as string[],
	canceledSubscriptionIds: [] as string[],
	expiredMetadataIds: [] as string[],
	deletedMetadataIds: [] as string[],
	metadataUpdates: [] as { id: string; expiresAt: number | null }[],
};

const resetState = ({
	invoiceStatus,
	amountPaid,
	subscriptionStatus = "active",
	cancelFails = false,
}: {
	invoiceStatus: InvoiceStatus;
	amountPaid: number;
	subscriptionStatus?: "active" | "canceled" | "incomplete_expired";
	cancelFails?: boolean;
}) => {
	state.invoiceStatus = invoiceStatus;
	state.amountPaid = amountPaid;
	state.subscriptionStatus = subscriptionStatus;
	state.cancelFails = cancelFails;
	state.voidedInvoiceIds = [];
	state.canceledSubscriptionIds = [];
	state.expiredMetadataIds = [];
	state.deletedMetadataIds = [];
	state.metadataUpdates = [];
};

const buildStripeInvoice = () => ({
	id: "in_deferred",
	status: state.invoiceStatus,
	amount_paid: state.amountPaid,
	parent: { subscription_details: { subscription: STRIPE_SUBSCRIPTION_ID } },
});

const metadata = {
	id: "meta_deferred",
	type: MetadataType.DeferredInvoice,
	stripe_invoice_id: "in_deferred",
	data: {
		orgId: "org_deferred",
		env: AppEnv.Sandbox,
		billingContext: {
			fullCustomer: { id: "cus_deferred", env: AppEnv.Sandbox },
		},
		billingPlan: {
			stripe: { subscriptionAction: { type: "create", params: {} } },
		},
	},
} as unknown as Metadata;

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		invoices: {
			retrieve: async () => buildStripeInvoice(),
			voidInvoice: async (id: string) => {
				state.voidedInvoiceIds.push(id);
				return { ...buildStripeInvoice(), status: "void" };
			},
		},
		subscriptions: {
			retrieve: async (id: string) => ({
				id,
				status: state.subscriptionStatus,
			}),
			cancel: async (id: string) => {
				if (state.cancelFails) throw new Error("Stripe is unavailable");
				state.canceledSubscriptionIds.push(id);
			},
		},
	}),
}));

await mockModuleWithRestore("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		getWithFeatures: async () => ({
			org: { id: "org_deferred", slug: "deferred-org" },
		}),
	},
}));

await mockModuleWithRestore("@/external/redis/resolveRedisV2.js", () => ({
	resolveRedisV2: () => ({}),
}));

await mockModuleWithRestore(
	"@/internal/billing/v2/execute/pendingCustomerProducts/expirePendingCustomerProducts.js",
	() => ({
		expirePendingCustomerProducts: async ({
			metadataId,
		}: {
			metadataId: string;
		}) => {
			state.expiredMetadataIds.push(metadataId);
			return 1;
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js",
	() => ({ deleteCachedFullCustomer: async () => {} }),
);

await mockModuleWithRestore("@/internal/metadata/MetadataService.js", () => ({
	MetadataService: {
		getByStripeInvoiceId: async () => metadata,
		delete: async ({ id }: { id: string }) => {
			state.deletedMetadataIds.push(id);
		},
		update: async ({
			id,
			updates,
		}: {
			id: string;
			updates: { expires_at: number | null };
		}) => {
			state.metadataUpdates.push({ id, expiresAt: updates.expires_at });
		},
	},
}));

const { handleVoidInvoiceCron } = await import(
	"@/cron/invoiceCron/runInvoiceCron.js"
);
const { expirePendingPlanForVoidedInvoice } = await import(
	"@/internal/billing/v2/actions/expirePendingPlan/expirePendingPlanForVoidedInvoice.js"
);

const logger = {
	error: () => {},
	info: () => {},
	warn: () => {},
	debug: () => {},
};

const runCron = () =>
	handleVoidInvoiceCron({
		metadata,
		ctx: { db: {} as never, logger: logger as never },
	});

const expectUntouchedWithExpiryCleared = () => {
	expect(state.voidedInvoiceIds).toEqual([]);
	expect(state.expiredMetadataIds).toEqual([]);
	expect(state.canceledSubscriptionIds).toEqual([]);
	expect(state.deletedMetadataIds).toEqual([]);
	expect(state.metadataUpdates).toEqual([{ id: metadata.id, expiresAt: null }]);
};

test("cron: an unpaid deferred invoice voids, expires the plan and cancels the created sub", async () => {
	resetState({ invoiceStatus: "open", amountPaid: 0 });

	await runCron();

	expect(state.voidedInvoiceIds).toEqual(["in_deferred"]);
	expect(state.expiredMetadataIds).toEqual([metadata.id]);
	expect(state.canceledSubscriptionIds).toEqual([STRIPE_SUBSCRIPTION_ID]);
	expect(state.deletedMetadataIds).toEqual([metadata.id]);
});

test("cron: an unpaid uncollectible invoice is voided before its plan expires", async () => {
	resetState({ invoiceStatus: "uncollectible", amountPaid: 0 });

	await runCron();

	expect(state.voidedInvoiceIds).toEqual(["in_deferred"]);
	expect(state.expiredMetadataIds).toEqual([metadata.id]);
	expect(state.canceledSubscriptionIds).toEqual([STRIPE_SUBSCRIPTION_ID]);
	expect(state.deletedMetadataIds).toEqual([metadata.id]);
});

test("cron: a partially paid open invoice is left alone and stops being re-picked", async () => {
	resetState({ invoiceStatus: "open", amountPaid: 500 });

	await runCron();

	expectUntouchedWithExpiryCleared();
});

test("cron: a partially paid voided invoice is left alone and stops being re-picked", async () => {
	resetState({ invoiceStatus: "void", amountPaid: 500 });

	await runCron();

	expectUntouchedWithExpiryCleared();
});

test("void webhook: a partially paid voided invoice keeps its pending plan", async () => {
	resetState({ invoiceStatus: "void", amountPaid: 500 });

	const expired = await expirePendingPlanForVoidedInvoice({
		ctx: {
			db: {} as never,
			logger,
			org: { id: "org_deferred" },
			env: AppEnv.Sandbox,
		} as never,
		stripeInvoice: buildStripeInvoice() as never,
		customerId: "cus_deferred",
	});

	expect(expired).toBe(false);
	expect(state.expiredMetadataIds).toEqual([]);
	expect(state.canceledSubscriptionIds).toEqual([]);
	expect(state.deletedMetadataIds).toEqual([]);
});

test("cron: a failed sub cancel keeps the metadata so the next run retries", async () => {
	resetState({ invoiceStatus: "void", amountPaid: 0, cancelFails: true });

	await runCron();

	expect(state.expiredMetadataIds).toEqual([metadata.id]);
	expect(state.canceledSubscriptionIds).toEqual([]);
	expect(state.deletedMetadataIds).toEqual([]);
});

test("cron: an already canceled sub is not canceled again", async () => {
	resetState({
		invoiceStatus: "void",
		amountPaid: 0,
		subscriptionStatus: "canceled",
	});

	await runCron();

	expect(state.canceledSubscriptionIds).toEqual([]);
	expect(state.deletedMetadataIds).toEqual([metadata.id]);
});

test("cron: an incomplete_expired sub is not canceled", async () => {
	resetState({
		invoiceStatus: "void",
		amountPaid: 0,
		subscriptionStatus: "incomplete_expired",
	});

	await runCron();

	expect(state.canceledSubscriptionIds).toEqual([]);
	expect(state.deletedMetadataIds).toEqual([metadata.id]);
});
