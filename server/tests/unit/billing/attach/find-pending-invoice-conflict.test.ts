// Red: every invoice-backed pending plan was rejected with 409. Green: an open invoice
// is resumed from a fresh Stripe retrieve; paid/void/no-URL states still raise 409.

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
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const state = {
	invoiceStatus: "open" as "open" | "paid" | "void",
	hostedInvoiceUrl: "https://invoice.stripe.com/i/inv_pending" as string | null,
	retrievedInvoiceIds: [] as string[],
};

const metadataId = "meta_pending_invoice";
const stripeInvoiceId = "in_pending";

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		invoices: {
			retrieve: async (id: string) => {
				state.retrievedInvoiceIds.push(id);
				return {
					id,
					status: state.invoiceStatus,
					hosted_invoice_url: state.hostedInvoiceUrl,
					total: 1000,
					currency: "usd",
				};
			},
		},
	}),
}));

await mockModuleWithRestore("@/internal/metadata/MetadataService.js", () => ({
	MetadataService: {
		get: async () => ({
			id: metadataId,
			type: MetadataType.DeferredInvoice,
			stripe_invoice_id: stripeInvoiceId,
			stripe_checkout_session_id: null,
			data: {},
		}),
	},
}));

const attachProduct: FullProduct = products.createFull({
	id: "premium",
	prices: [prices.createFixed({ id: "price_premium" })],
});

const pendingCustomerProduct = {
	id: "cp_pending",
	internal_customer_id: "icus_1",
	internal_entity_id: null,
	status: CusProductStatus.Pending,
	metadata_id: metadataId,
	product: attachProduct,
	customer_prices: [
		{ price: attachProduct.prices[0], customer_product_id: "cp_pending" },
	],
	customer_entitlements: [],
} as unknown as FullCusProduct;

await mockModuleWithRestore(
	"@/internal/customers/cusProducts/CusProductService.js",
	() => ({
		CusProductService: {
			list: async () => [pendingCustomerProduct],
		},
	}),
);

const { findPendingInvoiceConflict } = await import(
	"@/internal/billing/v2/common/pendingInvoiceConflict/findPendingInvoiceConflict.js"
);

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

const resetState = () => {
	state.invoiceStatus = "open";
	state.hostedInvoiceUrl = "https://invoice.stripe.com/i/inv_pending";
	state.retrievedInvoiceIds = [];
};

test("resumes an open pending invoice from a fresh Stripe retrieve", async () => {
	resetState();

	const billingResult = await findPendingInvoiceConflict({
		ctx,
		fullCustomer,
		attachProduct,
	});

	expect(state.retrievedInvoiceIds).toEqual([stripeInvoiceId]);
	expect(billingResult?.stripe.stripeInvoice?.id).toBe(stripeInvoiceId);
	expect(billingResult?.stripe.stripeInvoice?.status).toBe("open");
	expect(billingResult?.stripe.deferredMetadataId).toBe(metadataId);
	expect(billingResult?.stripe.requiredAction).toBeUndefined();
});

test("reports a paid pending invoice as processing instead of payable", async () => {
	resetState();
	state.invoiceStatus = "paid";

	let thrown: unknown;
	try {
		await findPendingInvoiceConflict({ ctx, fullCustomer, attachProduct });
	} catch (error) {
		thrown = error;
	}

	expect(thrown).toBeInstanceOf(RecaseError);
	expect((thrown as RecaseError).statusCode).toBe(409);
	expect((thrown as RecaseError).code).toBe(ErrCode.PendingPlanConflict);
	expect((thrown as RecaseError).message).toInclude("still processing");
});

test("refuses a void pending invoice and names the state", async () => {
	resetState();
	state.invoiceStatus = "void";

	let thrown: unknown;
	try {
		await findPendingInvoiceConflict({ ctx, fullCustomer, attachProduct });
	} catch (error) {
		thrown = error;
	}

	expect(thrown).toBeInstanceOf(RecaseError);
	expect((thrown as RecaseError).code).toBe(ErrCode.PendingPlanConflict);
	expect((thrown as RecaseError).message).toInclude("invoice is void");
});

test("skips add-on attach targets without touching Stripe", async () => {
	resetState();

	const billingResult = await findPendingInvoiceConflict({
		ctx,
		fullCustomer,
		attachProduct: { ...attachProduct, is_add_on: true },
	});

	expect(billingResult).toBeUndefined();
	expect(state.retrievedInvoiceIds).toEqual([]);
});
