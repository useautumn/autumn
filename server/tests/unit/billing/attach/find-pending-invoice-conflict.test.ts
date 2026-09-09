// Red: every invoice-backed pending plan was rejected with 409, then the first row's
// invoice was resumed regardless of siblings. Green: earliest open wins; paid blocks.

import { expect, test } from "bun:test";
import {
	AppEnv,
	CusProductStatus,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	MetadataType,
	RecaseError,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import Stripe from "stripe";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

type InvoiceStatus = "open" | "paid" | "void" | "missing";

const state = {
	invoices: {} as Record<string, { status: InvoiceStatus; url: string | null }>,
	retrievedInvoiceIds: [] as string[],
};

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		invoices: {
			retrieve: async (id: string) => {
				state.retrievedInvoiceIds.push(id);
				const invoice = state.invoices[id];
				if (!invoice) throw new Error(`No such invoice: ${id}`);
				if (invoice.status === "missing")
					throw new Stripe.errors.StripeInvalidRequestError({
						type: "invalid_request_error",
						code: "resource_missing",
						message: `No such invoice: '${id}'`,
					});
				return {
					id,
					status: invoice.status,
					hosted_invoice_url: invoice.url,
					total: 1000,
					currency: "usd",
				};
			},
		},
	}),
}));

await mockModuleWithRestore("@/internal/metadata/MetadataService.js", () => ({
	MetadataService: {
		get: async ({ id }: { id: string }) => ({
			id,
			type: MetadataType.DeferredInvoice,
			stripe_invoice_id: id.replace("meta_", "in_"),
			stripe_checkout_session_id: null,
			data: {},
		}),
	},
}));

const { findPendingInvoiceConflict } = await import(
	"@/internal/billing/v2/common/pendingInvoiceConflict/findPendingInvoiceConflict.js"
);

const attachProduct: FullProduct = products.createFull({
	id: "premium",
	prices: [prices.createFixed({ id: "price_premium" })],
});

const pendingRow = ({
	invoiceId,
	createdAt,
}: {
	invoiceId: string;
	createdAt: number;
}) =>
	({
		id: `cp_${invoiceId}`,
		internal_customer_id: "icus_1",
		internal_entity_id: null,
		status: CusProductStatus.Pending,
		metadata_id: invoiceId.replace("in_", "meta_"),
		created_at: createdAt,
		product: attachProduct,
		customer_prices: [
			{
				price: attachProduct.prices[0],
				customer_product_id: `cp_${invoiceId}`,
			},
		],
		customer_entitlements: [],
	}) as unknown as FullCusProduct;

const fullCustomer = {
	id: "cus_1",
	internal_id: "icus_1",
	entity: undefined,
	customer_products: [],
} as unknown as FullCustomer;

const ctx = {
	db: {} as never,
	org: { id: "org_1" },
	env: AppEnv.Sandbox,
	logger: { info: () => {}, warn: () => {}, error: () => {} },
} as never;

const withInvoices = (
	invoices: Record<string, { status: InvoiceStatus; url?: string | null }>,
) => {
	state.retrievedInvoiceIds = [];
	state.invoices = Object.fromEntries(
		Object.entries(invoices).map(([id, invoice]) => [
			id,
			{ status: invoice.status, url: invoice.url ?? `https://pay/${id}` },
		]),
	);
};

const expectConflict = async ({
	rows,
	messageIncludes,
}: {
	rows: FullCusProduct[];
	messageIncludes: string;
}) => {
	let thrown: unknown;
	try {
		await findPendingInvoiceConflict({
			ctx,
			fullCustomer,
			attachProduct,
			loadPendingCustomerProducts: async () => rows,
		});
	} catch (error) {
		thrown = error;
	}
	expect(thrown).toBeInstanceOf(RecaseError);
	expect((thrown as RecaseError).statusCode).toBe(409);
	expect((thrown as RecaseError).code).toBe(ErrCode.PendingPlanConflict);
	expect((thrown as RecaseError).message).toInclude(messageIncludes);
};

test("resumes an open pending invoice from a fresh Stripe retrieve", async () => {
	withInvoices({ in_a: { status: "open" } });

	const billingResult = await findPendingInvoiceConflict({
		ctx,
		fullCustomer,
		attachProduct,
		loadPendingCustomerProducts: async () => [
			pendingRow({ invoiceId: "in_a", createdAt: 1 }),
		],
	});

	expect(state.retrievedInvoiceIds).toEqual(["in_a"]);
	expect(billingResult?.stripe.stripeInvoice?.id).toBe("in_a");
	expect(billingResult?.stripe.deferredMetadataId).toBe("meta_a");
	expect(billingResult?.stripe.resumedPendingInvoice).toBe(true);
	expect(billingResult?.stripe.requiredAction).toBeUndefined();
});

test("two open invoices: the earliest-created one wins regardless of row order", async () => {
	withInvoices({ in_late: { status: "open" }, in_early: { status: "open" } });

	const billingResult = await findPendingInvoiceConflict({
		ctx,
		fullCustomer,
		attachProduct,
		loadPendingCustomerProducts: async () => [
			pendingRow({ invoiceId: "in_late", createdAt: 20 }),
			pendingRow({ invoiceId: "in_early", createdAt: 10 }),
		],
	});

	expect(billingResult?.stripe.stripeInvoice?.id).toBe("in_early");
});

test("equal created_at: the lower invoice id wins in either row order", async () => {
	withInvoices({ in_b: { status: "open" }, in_a: { status: "open" } });
	const rowA = pendingRow({ invoiceId: "in_a", createdAt: 5 });
	const rowB = pendingRow({ invoiceId: "in_b", createdAt: 5 });

	for (const rows of [
		[rowA, rowB],
		[rowB, rowA],
	]) {
		const billingResult = await findPendingInvoiceConflict({
			ctx,
			fullCustomer,
			attachProduct,
			loadPendingCustomerProducts: async () => rows,
		});
		expect(billingResult?.stripe.stripeInvoice?.id).toBe("in_a");
	}
});

test("a missing invoice is skipped and the open one is resumed", async () => {
	withInvoices({ in_gone: { status: "missing" }, in_open: { status: "open" } });

	const billingResult = await findPendingInvoiceConflict({
		ctx,
		fullCustomer,
		attachProduct,
		loadPendingCustomerProducts: async () => [
			pendingRow({ invoiceId: "in_gone", createdAt: 1 }),
			pendingRow({ invoiceId: "in_open", createdAt: 2 }),
		],
	});

	expect(billingResult?.stripe.stripeInvoice?.id).toBe("in_open");
});

test("all invoices missing: blocks instead of minting a fresh invoice", async () => {
	withInvoices({ in_gone: { status: "missing" } });

	await expectConflict({
		rows: [pendingRow({ invoiceId: "in_gone", createdAt: 1 })],
		messageIncludes: "invoice is missing",
	});
});

test("a failed invoice retrieve propagates and never offers another payment", async () => {
	withInvoices({ in_open: { status: "open" } });
	const rows = [
		pendingRow({ invoiceId: "in_missing", createdAt: 1 }),
		pendingRow({ invoiceId: "in_open", createdAt: 2 }),
	];

	await expect(
		findPendingInvoiceConflict({
			ctx,
			fullCustomer,
			attachProduct,
			loadPendingCustomerProducts: async () => rows,
		}),
	).rejects.toThrow("No such invoice: in_missing");
});

test("a void invoice listed first does not mask a later open one", async () => {
	withInvoices({ in_void: { status: "void" }, in_open: { status: "open" } });

	const billingResult = await findPendingInvoiceConflict({
		ctx,
		fullCustomer,
		attachProduct,
		loadPendingCustomerProducts: async () => [
			pendingRow({ invoiceId: "in_void", createdAt: 1 }),
			pendingRow({ invoiceId: "in_open", createdAt: 2 }),
		],
	});

	expect(billingResult?.stripe.stripeInvoice?.id).toBe("in_open");
});

test("a paid invoice blocks even when another open one exists", async () => {
	withInvoices({ in_open: { status: "open" }, in_paid: { status: "paid" } });

	await expectConflict({
		rows: [
			pendingRow({ invoiceId: "in_open", createdAt: 1 }),
			pendingRow({ invoiceId: "in_paid", createdAt: 2 }),
		],
		messageIncludes: "still processing",
	});
});

test("only a void invoice: refuses and names the state", async () => {
	withInvoices({ in_void: { status: "void" } });

	await expectConflict({
		rows: [pendingRow({ invoiceId: "in_void", createdAt: 1 })],
		messageIncludes: "invoice is void",
	});
});

test("skips add-on attach targets without loading rows or touching Stripe", async () => {
	withInvoices({ in_a: { status: "open" } });
	let loads = 0;

	const billingResult = await findPendingInvoiceConflict({
		ctx,
		fullCustomer,
		attachProduct: { ...attachProduct, is_add_on: true },
		loadPendingCustomerProducts: async () => {
			loads += 1;
			return [pendingRow({ invoiceId: "in_a", createdAt: 1 })];
		},
	});

	expect(billingResult).toBeUndefined();
	expect(loads).toBe(0);
	expect(state.retrievedInvoiceIds).toEqual([]);
});
