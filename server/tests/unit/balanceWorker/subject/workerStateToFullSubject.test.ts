import { describe, expect, test } from "bun:test";
import { type CatalogRow, catalogRowsToCatalog } from "@autumn/balance-engine";
import { getApiCustomerLicenses } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products.js";
import { autumnBillingPlanToCatalogRows } from "@/internal/balanceWorker/billingPlan/autumnBillingPlanToCatalogRows.js";
import { workerStateToFullSubject } from "@/internal/balanceWorker/subject/workerStateToFullSubject.js";
import { firstGrantOf, product } from "../billingPlan/billingPlanFixtures.js";
import { customerMemory } from "../billingPlan/workerMemory/workerMemory.js";

const parent = product({ id: "cp_team" });

const pool = ({
	id,
	planLicenseId,
	parentId = parent.id,
}: {
	id: string;
	planLicenseId: string | null;
	parentId?: string;
}) => ({
	id,
	link_id: `link_${id}`,
	internal_customer_id: parent.internal_customer_id,
	parent_customer_product_id: parentId,
	license_internal_product_id: "internal_seat",
	plan_license_id: planLicenseId,
	granted: 10,
	remaining: 7,
	paid_quantity: 5,
	created_at: 1,
	updated_at: 1,
});

const seatProduct = products.createFull({ id: "seat" });
const [seatPrice] = parent.customer_prices;
const seatEntitlement = firstGrantOf(parent).entitlement;

/** The seat link as the worker's catalog holds it: made of the parent's own price and entitlement. */
const seatPlanLicenseRows = (): CatalogRow[] => [
	{
		table: "planLicenses",
		row: {
			id: "pl_seat",
			parent_internal_product_id: parent.internal_product_id,
			license_internal_product_id: seatProduct.internal_id,
			org_id: seatProduct.org_id,
			env: seatProduct.env,
			is_custom: false,
			included: 5,
			prepaid_only: true,
			customized: false,
			metadata: {},
			created_at: 1,
			updated_at: 1,
			price_ids: seatPrice ? [seatPrice.price.id] : [],
			entitlement_ids: [seatEntitlement.id],
			internal_feature_ids: [seatEntitlement.internal_feature_id],
		},
	},
	{ table: "products", row: seatProduct },
];

const fullSubjectWithPools = () => {
	const state = {
		...customerMemory({ customerProducts: [parent] }),
		customerLicenses: [
			pool({ id: "cl_live", planLicenseId: "pl_seat" }),
			pool({ id: "cl_removed_link", planLicenseId: null }),
			pool({ id: "cl_uncached_link", planLicenseId: "pl_deleted" }),
		],
	};
	const catalog = catalogRowsToCatalog({
		rows: [
			...autumnBillingPlanToCatalogRows({
				autumnBillingPlan: {
					customerId: "cus_test",
					insertCustomerProducts: [parent],
				},
			}),
			...seatPlanLicenseRows(),
		],
	});
	return workerStateToFullSubject({
		state,
		catalog,
		subscriptions: [],
		invoices: [],
	});
};

describe("workerStateToFullSubject: license pools", () => {
	test("each product carries the worker's pools with their definitions; a removed or uncached link keeps none", () => {
		const [customerProduct] = fullSubjectWithPools().customer_products;
		expect(
			customerProduct?.customer_licenses?.map(({ id, planLicense }) => [
				id,
				planLicense?.id ?? null,
			]),
		).toEqual([
			["cl_live", "pl_seat"],
			["cl_removed_link", null],
			["cl_uncached_link", null],
		]);
	});

	test("a definition is assembled from the catalog: the license product with its effective items", () => {
		const [customerProduct] = fullSubjectWithPools().customer_products;
		const planLicense = customerProduct?.customer_licenses?.[0]?.planLicense;
		expect({
			product: planLicense?.product.internal_id,
			prices: planLicense?.product.prices.map(({ id }) => id),
			entitlements: planLicense?.product.entitlements.map(({ id, feature }) => [
				id,
				feature.internal_id,
			]),
		}).toEqual({
			product: seatProduct.internal_id,
			prices: [seatPrice?.price.id],
			entitlements: [[seatEntitlement.id, seatEntitlement.internal_feature_id]],
		});
	});

	test("customers.get renders the live pool's seats from the worker's counters", () => {
		const { customer_products } = fullSubjectWithPools();
		expect(
			getApiCustomerLicenses({ customerProducts: customer_products }),
		).toEqual([
			{
				license_plan_id: "seat",
				parent_plan_id: parent.product.id,
				license_plan_name: expect.any(String),
				granted: 10,
				usage: 3,
				remaining: 7,
				paid_quantity: 5,
			},
		]);
	});
});
