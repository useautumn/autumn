import { describe, expect, test } from "bun:test";
import type { FullCusProduct, FullCustomerLicense } from "@autumn/shared";
import { insertCustomerProductsToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/customerProducts/insertCustomerProductsToPlanOps.js";
import {
	grantWithRollovers,
	opSummary,
	planOf,
	product,
	workerEntity,
} from "../../billingPlanFixtures.js";

const opsFor = (insertCustomerProducts: FullCusProduct[]) =>
	insertCustomerProductsToPlanOps({
		autumnBillingPlan: planOf({ insertCustomerProducts }),
	});

const licensePool = (): FullCustomerLicense => ({
	id: "license_pool_1",
	link_id: "license_link_1",
	internal_customer_id: "cus_internal_test",
	parent_customer_product_id: "cp_one",
	license_internal_product_id: "internal_seat",
	plan_license_id: null,
	granted: 5,
	remaining: 5,
	paid_quantity: 0,
	created_at: 1,
	updated_at: 1,
	planLicense: null,
});

const insertedRow = ({
	ops,
	table,
}: {
	ops: ReturnType<typeof opsFor>;
	table: "customerProducts" | "customerPrices" | "customerEntitlements";
}) => {
	const op = ops.find(
		(candidate) => candidate.op === "insert" && candidate.table === table,
	);
	if (op?.op !== "insert") throw new Error(`no ${table} insert`);
	return op.row;
};

describe("insertCustomerProductsToPlanOps", () => {
	test("a plan that inserts no product inserts nothing", () => {
		expect(opsFor([])).toEqual([]);
	});

	test("each product comes before its prices, then its grants, each grant followed by its capped rollovers", () => {
		const withRollovers = product({
			id: "cp_one",
			grants: [
				grantWithRollovers({
					id: "grant_one",
					customerProductId: "cp_one",
					max: null,
					carried: [{ id: "ro_1", balance: 5, expiresAt: 1 }],
				}),
			],
		});
		const ops = opsFor([withRollovers, product({ id: "cp_two" })]);
		expect(
			ops.map((op) => (op.op === "insert" ? `${op.table}:${op.row.id}` : "")),
		).toEqual([
			"customerProducts:cp_one",
			"customerPrices:cus_price_cp_one",
			"customerEntitlements:grant_one",
			"rollovers:ro_1",
			"customerProducts:cp_two",
			"customerPrices:cus_price_cp_two",
			"customerEntitlements:grant_cp_two",
		]);
	});

	test("license pools stay in Postgres: the worker is sent no op for them", () => {
		const withPool = {
			...product({ id: "cp_one" }),
			customer_licenses: [licensePool()],
		};
		expect(opSummary(opsFor([withPool]))).toEqual([
			"insert:customerProducts",
			"insert:customerPrices",
			"insert:customerEntitlements",
		]);
	});

	test("rows are cut to stored columns: no joined product, items, trial or licenses", () => {
		const ops = opsFor([
			{ ...product({ id: "cp_one" }), customer_licenses: [licensePool()] },
		]);
		const productRow = insertedRow({ ops, table: "customerProducts" });
		for (const joined of [
			"product",
			"customer_prices",
			"customer_entitlements",
			"free_trial",
			"customer_licenses",
		])
			expect(productRow).not.toHaveProperty(joined);
		expect(insertedRow({ ops, table: "customerPrices" })).not.toHaveProperty(
			"price",
		);
	});

	test("a product on an entity keeps the entity's ids, and so does its grant", () => {
		const ops = opsFor([product({ id: "cp_entity", onEntity: true })]);
		expect(insertedRow({ ops, table: "customerProducts" })).toMatchObject({
			internal_entity_id: workerEntity.internal_id,
			entity_id: workerEntity.id,
		});
		expect(insertedRow({ ops, table: "customerEntitlements" })).toMatchObject({
			internal_entity_id: workerEntity.internal_id,
		});
	});
});
