import { beforeEach, expect, mock, test } from "bun:test";
import { AppEnv, type Invoice, MetadataType } from "@autumn/shared";
import { Hono } from "hono";
import type Stripe from "stripe";
import type { StripeInvoicePaidContext } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/setupStripeInvoicePaidContext";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { UpsertCachedInvoiceV2Result } from "@/internal/customers/cache/fullSubject/actions/upsertCachedInvoiceV2";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore";

const state = {
	cacheResult: { success: true } as UpsertCachedInvoiceV2Result | null,
	patchThrows: false,
	metadataType: undefined as MetadataType | undefined,
	threshold: false,
	throwAfterInvoice: false,
	clears: 0,
	activeWrites: 0,
	billingWrites: 0,
	invoiceWrites: 0,
	invoicePatches: 0,
};
const invoice = {
	id: "invoice_123",
	stripe_id: "in_123",
	status: "paid",
} as Invoice;

await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeInvoicePaid/setupStripeInvoicePaidContext",
	() => ({
		setupStripeInvoicePaidContext: async () =>
			({
				stripeInvoice: {
					id: "in_123",
					billing_reason: "subscription_create",
					metadata: {
						...(state.metadataType
							? { autumn_metadata_id: "metadata_123" }
							: {}),
						...(state.threshold
							? { autumn_action_source: "threshold_billing" }
							: {}),
					},
				},
				results: {
					updatedCustomerProductIds: [],
					appliedBillingPlan: false,
					invoiceCache: null,
				},
			}) as unknown as StripeInvoicePaidContext,
	}),
);
await mockModuleWithRestore(
	"@/internal/invoices/utils/initInvoiceFromStripe",
	() => ({ initInvoiceFromStripe: async () => invoice }),
);
await mockModuleWithRestore("@/internal/invoices/InvoiceService", () => ({
	InvoiceService: {
		upsert: async () => {
			state.invoiceWrites++;
			return invoice;
		},
	},
}));
await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/index.js",
	() => ({
		upsertCachedInvoiceV2: async () => {
			state.invoicePatches++;
			if (state.patchThrows) throw new Error("Redis unavailable");
			return state.cacheResult;
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js",
	() => ({
		deleteCachedFullCustomer: async () => {
			state.clears++;
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/customers/cusProducts/actions/index.js",
	() => ({
		customerProductActions: {
			markActive: async () => {
				state.activeWrites++;
			},
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/updateCachedCustomerProduct.js",
	() => ({ updateCachedCustomerProductV2: async () => {} }),
);
await mockModuleWithRestore("@/internal/balances/autoTopUp/repos", () => ({
	autoTopupLimitRepo: { clearSuspensions: async () => 0 },
}));
await mockModuleWithRestore("@/internal/metadata/MetadataService.js", () => ({
	MetadataService: {
		get: async () =>
			state.metadataType
				? {
						type: state.metadataType,
						data: {
							org: { id: "org_123" },
							customer: { id: "customer_123", env: AppEnv.Sandbox },
						},
					}
				: undefined,
	},
}));
await mockModuleWithRestore(
	"@/internal/billing/v2/execute/executeDeferredBillingPlan.js",
	() => ({
		executeDeferredBillingPlan: async () => {
			state.billingWrites++;
		},
	}),
);
await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/handleStripeInvoiceMetadata/handleInvoiceActionRequiredCompleted.js",
	() => ({
		handleInvoiceActionRequiredCompleted: async () => {
			state.billingWrites++;
		},
	}),
);
await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/handleStripeInvoiceMetadata/handleInvoiceCheckoutPaid.js",
	() => ({
		handleInvoiceCheckoutPaid: async () => {
			state.billingWrites++;
		},
	}),
);
await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/handleStripeInvoiceDiscounts.js",
	() => ({
		handleStripeInvoiceDiscounts: async () => {},
	}),
);
await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/sendEmailReceipt.js",
	() => ({
		sendEmailReceipt: async () => {
			if (state.throwAfterInvoice) throw new Error("handler failed");
		},
	}),
);

const { handleStripeInvoicePaid } = await import(
	"@/external/stripe/webhookHandlers/handleStripeInvoicePaid/handleStripeInvoicePaid"
);
const { stripeWebhookRefreshMiddleware, shouldRefreshAfterWebhookHandler } =
	await import(
		"@/external/stripe/webhookMiddlewares/stripeWebhookRefreshMiddleware"
	);

beforeEach(() => {
	Object.assign(state, {
		cacheResult: { success: true },
		patchThrows: false,
		metadataType: undefined,
		threshold: false,
		throwAfterInvoice: false,
		clears: 0,
		activeWrites: 0,
		billingWrites: 0,
		invoiceWrites: 0,
		invoicePatches: 0,
	});
});

const runPaidWebhook = async () => {
	const event = {
		type: "invoice.paid",
		request: null,
		data: {
			object: { customer: "cus_123", billing_reason: "subscription_create" },
		},
	} as Stripe.InvoicePaidEvent;
	const ctx = {
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		fullCustomer: {
			id: "customer_123",
			customer_products: state.threshold
				? [
						{
							id: "customer_product_123",
							status: "past_due",
							customer_prices: [
								{ price: { config: { threshold_billing: {} } } },
							],
						},
					]
				: [],
		},
		stripeEvent: event,
		logger: {
			debug: mock(() => {}),
			warn: mock(() => {}),
			info: mock(() => {}),
			error: mock(() => {}),
		},
	} as unknown as StripeWebhookContext;
	const app = new Hono<StripeWebhookHonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", ctx);
		await next();
	});
	app.use("*", stripeWebhookRefreshMiddleware);
	app.post("/", async (c) => {
		await handleStripeInvoicePaid({ ctx, event });
		return c.json({ received: true });
	});
	const response = await app.request("http://localhost/", { method: "POST" });
	return { ctx, response };
};

test("initial invoice patches the cache without deleting customer balances", async () => {
	const { ctx, response } = await runPaidWebhook();
	expect(response.status).toBe(200);
	expect(state.invoiceWrites).toBe(1);
	expect(state.invoicePatches).toBe(1);
	expect(state.clears).toBe(0);
	expect(ctx.handlerResult?.context.results).toEqual({
		updatedCustomerProductIds: [],
		appliedBillingPlan: false,
		invoiceCache: { success: true },
	});
});

test.each([null, { success: false, cacheMiss: true }])(
	"uncertain invoice cache result retains refresh: %j",
	async (cacheResult) => {
		state.cacheResult = cacheResult;
		const { response } = await runPaidWebhook();
		expect(response.status).toBe(200);
		expect(state.clears).toBe(1);
	},
);

test("a thrown invoice cache patch retains refresh", async () => {
	state.patchThrows = true;
	const { response } = await runPaidWebhook();
	expect(response.status).toBe(200);
	expect(state.clears).toBe(1);
});

test("product activation is recorded even when the invoice patch succeeds", async () => {
	state.threshold = true;
	const { ctx } = await runPaidWebhook();
	expect(state.activeWrites).toBe(1);
	expect(state.clears).toBe(2);
	expect(ctx.handlerResult?.type).toBe("invoice.paid");
	if (ctx.handlerResult?.type !== "invoice.paid")
		throw new Error("Missing invoice result");
	expect(ctx.handlerResult.context.results.updatedCustomerProductIds).toEqual([
		"customer_product_123",
	]);
});

test.each([
	MetadataType.DeferredInvoice,
	MetadataType.InvoiceActionRequired,
	MetadataType.InvoiceCheckout,
])("billing metadata changes retain refresh: %s", async (metadataType) => {
	state.metadataType = metadataType;
	const { ctx, response } = await runPaidWebhook();
	expect(response.status).toBe(200);
	expect(state.billingWrites).toBe(1);
	expect(state.clears).toBeGreaterThan(0);
	if (ctx.handlerResult?.type !== "invoice.paid")
		throw new Error("Missing invoice result");
	expect(ctx.handlerResult.context.results.appliedBillingPlan).toBe(true);
});

test("a later handler failure cannot publish a cache-preserving result", async () => {
	state.throwAfterInvoice = true;
	const { ctx, response } = await runPaidWebhook();
	expect(response.status).toBe(500);
	expect(ctx.handlerResult).toBeUndefined();
	expect(shouldRefreshAfterWebhookHandler({ ctx })).toBe(true);
});
