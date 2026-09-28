import { describe, expect, test } from "bun:test";
import type { BillingPlanOp } from "@autumn/balance-engine";
import { type AutumnBillingPlan, CusProductStatus } from "@autumn/shared";
import { patchCustomerProductsToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/customerProducts/patchCustomerProductsToPlanOps.js";
import {
	customerPrice,
	firstGrantOf,
	grant,
	grantWithRollovers,
	planOf,
	product,
} from "../../billingPlanFixtures.js";

type Patch = NonNullable<AutumnBillingPlan["patchCustomerProducts"]>[number];

const patchOf = ({
	productId,
	status = CusProductStatus.Active,
}: {
	productId: string;
	status?: CusProductStatus;
}): Patch => {
	const patched = product({ id: productId, status });
	const [oldPrice] = patched.customer_prices;
	if (!oldPrice) throw new Error("fixture has no price");
	return {
		customerProduct: patched,
		insertCustomerEntitlements: [
			grantWithRollovers({
				id: `grant_new_${productId}`,
				customerProductId: productId,
				max: null,
				carried: [{ id: `ro_new_${productId}`, balance: 5, expiresAt: 1 }],
			}),
		],
		insertCustomerPrices: [
			customerPrice({
				priceId: `new_${productId}`,
				customerProductId: productId,
			}),
		],
		deleteCustomerPrices: [oldPrice],
		deleteCustomerEntitlements: [firstGrantOf(patched)],
	};
};

const opsFor = (patchCustomerProducts: Patch[]) =>
	patchCustomerProductsToPlanOps({
		autumnBillingPlan: planOf({ patchCustomerProducts }),
	});

const described = (ops: BillingPlanOp[]) =>
	ops.map((op) =>
		op.op === "insert"
			? `insert:${op.table}:${op.row.id}`
			: `${op.op}:${op.table}:${op.id}`,
	);

describe("patchCustomerProductsToPlanOps", () => {
	test("a plan with no patches changes nothing", () => {
		expect(
			patchCustomerProductsToPlanOps({ autumnBillingPlan: planOf({}) }),
		).toEqual([]);
		expect(opsFor([])).toEqual([]);
	});

	test("new grants with their rollovers, then new prices, then old prices out, then old grants out", () => {
		expect(described(opsFor([patchOf({ productId: "cp_a" })]))).toEqual([
			"insert:customerEntitlements:grant_new_cp_a",
			"insert:rollovers:ro_new_cp_a",
			"insert:customerPrices:cus_price_new_cp_a",
			"delete:customerPrices:cus_price_cp_a",
			"delete:customerEntitlements:grant_cp_a",
		]);
	});

	test("a patched product that is not live carries no rollovers", () => {
		for (const status of [
			CusProductStatus.Scheduled,
			CusProductStatus.Expired,
		]) {
			expect(
				described(opsFor([patchOf({ productId: "cp_a", status })])),
			).not.toContain("insert:rollovers:ro_new_cp_a");
		}
		expect(
			described(
				opsFor([
					patchOf({ productId: "cp_a", status: CusProductStatus.PastDue }),
				]),
			),
		).toContain("insert:rollovers:ro_new_cp_a");
	});

	test("a patch that only removes items is only deletes", () => {
		const patched = product({ id: "cp_a" });
		expect(
			described(
				opsFor([
					{
						customerProduct: patched,
						insertCustomerEntitlements: [],
						insertCustomerPrices: [],
						deleteCustomerPrices: [],
						deleteCustomerEntitlements: [
							grant({ id: "grant_gone", customerProductId: "cp_a" }),
						],
					},
				]),
			),
		).toEqual(["delete:customerEntitlements:grant_gone"]);
	});

	test("several patches come one after another, each in its own order", () => {
		expect(
			described(
				opsFor([
					patchOf({ productId: "cp_a" }),
					patchOf({ productId: "cp_b" }),
				]),
			),
		).toEqual([
			"insert:customerEntitlements:grant_new_cp_a",
			"insert:rollovers:ro_new_cp_a",
			"insert:customerPrices:cus_price_new_cp_a",
			"delete:customerPrices:cus_price_cp_a",
			"delete:customerEntitlements:grant_cp_a",
			"insert:customerEntitlements:grant_new_cp_b",
			"insert:rollovers:ro_new_cp_b",
			"insert:customerPrices:cus_price_new_cp_b",
			"delete:customerPrices:cus_price_cp_b",
			"delete:customerEntitlements:grant_cp_b",
		]);
	});
});
