import { beforeEach, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import type Stripe from "stripe";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { InvoiceUpsertResult } from "@/internal/invoices/actions/types/invoiceUpsertResult";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore";

const state = {
	billingReason: "subscription_create" as Stripe.Invoice.BillingReason,
	anchorResetIds: [] as string[],
	missingContext: false,
	clears: 0,
	customerStateChanged: false,
	invoiceResult: undefined as InvoiceUpsertResult | undefined,
	throwAfterInvoice: false,
};
const invoice = () => ({
	id: "in_123",
	customer: "cus_123",
	billing_reason: state.billingReason,
});
const processConsumable = mock(async () => []);
const processPrepaid = mock(
	async ({ eventContext }: { eventContext: InvoiceCreatedContext }) => {
		if (state.customerStateChanged)
			eventContext.results.customerStateChanged = true;
	},
);
const processAllocated = mock(async () => {});
const resetPools = mock(async () => {});
const updateProduct = mock(async () => {});
const retrieveInvoice = mock(async () => invoice());
const upsertInvoice = mock(async () => state.invoiceResult);

await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext",
	() => ({
		setupInvoiceCreatedContext: async () =>
			state.missingContext
				? null
				: ({
						stripeInvoice: invoice(),
						stripeSubscription: { schedule: "sub_sched_123" },
						billingCycleAnchorResetCustomerProductIds: state.anchorResetIds,
						results: { customerStateChanged: false },
					} as InvoiceCreatedContext),
	}),
);
await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processConsumablePricesForInvoiceCreated",
	() => ({ processConsumablePricesForInvoiceCreated: processConsumable }),
);
await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processPrepaidPricesForInvoiceCreated",
	() => ({ processPrepaidPricesForInvoiceCreated: processPrepaid }),
);
await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/processAllocatedPricesForInvoiceCreated",
	() => ({ processAllocatedPricesForInvoiceCreated: processAllocated }),
);
await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/tasks/resetSubscriptionPooledBalances",
	() => ({ resetSubscriptionPooledBalances: resetPools }),
);
await mockModuleWithRestore(
	"@/internal/customers/cusProducts/CusProductService",
	() => ({ CusProductService: { update: updateProduct } }),
);
await mockModuleWithRestore(
	"@/external/stripe/invoices/operations/getStripeInvoice",
	() => ({ getStripeInvoice: retrieveInvoice }),
);
await mockModuleWithRestore("@/external/stripe/webhookHandlers/common", () => ({
	upsertAutumnInvoice: upsertInvoice,
	storeRenewalLineItems: async () => {
		if (state.throwAfterInvoice) throw new Error("line item storage failed");
	},
}));
await mockModuleWithRestore(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer",
	() => ({
		deleteCachedFullCustomer: async () => {
			state.clears++;
		},
	}),
);

const { handleStripeInvoiceCreated } = await import(
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/handleStripeInvoiceCreated"
);
const { stripeWebhookRefreshMiddleware, shouldRefreshAfterWebhookHandler } =
	await import(
		"@/external/stripe/webhookMiddlewares/stripeWebhookRefreshMiddleware"
	);

beforeEach(() => {
	Object.assign(state, {
		billingReason: "subscription_create",
		anchorResetIds: [],
		missingContext: false,
		clears: 0,
		customerStateChanged: false,
		invoiceResult: undefined,
		throwAfterInvoice: false,
	});
	for (const task of [
		processConsumable,
		processPrepaid,
		processAllocated,
		resetPools,
		updateProduct,
		retrieveInvoice,
		upsertInvoice,
	])
		task.mockClear();
});

const runCreatedWebhook = async () => {
	const event = {
		type: "invoice.created",
		data: { object: invoice() },
	} as Stripe.InvoiceCreatedEvent;
	const ctx = {
		fullCustomer: { id: "customer_123" },
		stripeEvent: event,
		logger: {
			debug: mock(),
			info: mock(),
			warn: mock(),
			error: mock(),
		},
	} as unknown as StripeWebhookContext;
	const app = new Hono<StripeWebhookHonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", ctx);
		await next();
	});
	app.use("*", stripeWebhookRefreshMiddleware);
	app.post("/", async (c) => {
		await handleStripeInvoiceCreated({ ctx, event });
		return c.json({ received: true });
	});
	const response = await app.request("http://localhost/", { method: "POST" });
	return { ctx, response };
};

test.each([
	"subscription_create",
	"subscription_cycle",
	"subscription_update",
] as const)(
	"a completed %s with no customer changes preserves balances",
	async (billingReason) => {
		state.billingReason = billingReason;
		const { response } = await runCreatedWebhook();
		expect(response.status).toBe(200);
		expect(state.clears).toBe(0);
		expect(processConsumable).toHaveBeenCalledTimes(1);
		expect(processPrepaid).toHaveBeenCalledTimes(1);
		expect(processAllocated).toHaveBeenCalledTimes(1);
		expect(resetPools).toHaveBeenCalledTimes(1);
		expect(upsertInvoice).toHaveBeenCalledTimes(1);
	},
);

test("an initial invoice still records an applied anchor reset and refreshes", async () => {
	state.anchorResetIds = ["product_123"];
	const { ctx, response } = await runCreatedWebhook();
	expect(response.status).toBe(200);
	expect(updateProduct).toHaveBeenCalledTimes(1);
	expect(ctx.handlerResult?.context.results).toMatchObject({
		customerStateChanged: true,
	});
	expect(state.clears).toBe(1);
});

test.each([
	{ cacheResult: { success: true }, clears: 0 },
	{ cacheResult: { success: false, cacheMiss: true }, clears: 0 },
	{ cacheResult: { success: false }, clears: 1 },
	{ cacheResult: null, clears: 1 },
])(
	"invoice patch outcome controls fallback: %j",
	async ({ cacheResult, clears }) => {
		state.invoiceResult = { invoice: undefined, cacheResult };
		const { response } = await runCreatedWebhook();
		expect(response.status).toBe(200);
		expect(state.clears).toBe(clears);
	},
);

test("customer mutations still refresh after a successful invoice patch", async () => {
	state.customerStateChanged = true;
	state.invoiceResult = { invoice: undefined, cacheResult: { success: true } };
	const { response } = await runCreatedWebhook();
	expect(response.status).toBe(200);
	expect(state.clears).toBe(1);
});

test("a later handler failure cannot publish a cache-preserving result", async () => {
	state.throwAfterInvoice = true;
	state.invoiceResult = {
		invoice: { id: "invoice_123" } as NonNullable<
			InvoiceUpsertResult["invoice"]
		>,
		cacheResult: { success: true },
	};
	const { ctx, response } = await runCreatedWebhook();
	expect(response.status).toBe(500);
	expect(ctx.handlerResult).toBeUndefined();
	expect(shouldRefreshAfterWebhookHandler({ ctx })).toBe(true);
});

test("missing context retains the refresh fallback", async () => {
	state.missingContext = true;
	const { response } = await runCreatedWebhook();
	expect(response.status).toBe(200);
	expect(state.clears).toBe(1);
});
