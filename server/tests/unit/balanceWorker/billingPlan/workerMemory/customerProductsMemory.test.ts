import { describe, expect, test } from "bun:test";
import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import {
	customerPrice,
	firstGrantOf,
	grantWithRollovers,
	planOf,
	product,
	workerEntity,
} from "../billingPlanFixtures.js";
import {
	applyPlanToWorkerMemory,
	customerMemory,
	entityMemory,
	entityPartIn,
	idsOf,
} from "./workerMemory.js";

/** A product whose grant carries one stored rollover. */
const productWithRollover = (id: string): FullCusProduct =>
	product({
		id,
		grants: [
			grantWithRollovers({
				id: `grant_${id}`,
				customerProductId: id,
				max: null,
				carried: [{ id: `ro_${id}`, balance: 4, expiresAt: 1 }],
			}),
		],
	});

const memoryOf = (customerProducts: FullCusProduct[]) =>
	customerMemory({ customerProducts });

const rowsOwnedBy = ({
	state,
	productId,
}: {
	state: ReturnType<typeof customerMemory>;
	productId: string;
}) => ({
	product: state.customerProducts.filter(({ id }) => id === productId),
	prices: state.customerPrices.filter(
		({ customer_product_id }) => customer_product_id === productId,
	),
	grants: state.customerEntitlements.filter(
		({ customer_product_id }) => customer_product_id === productId,
	),
});

describe("customer product facets in worker memory", () => {
	test("an inserted product lands in the customer's part with its price and grant", async () => {
		const { customer } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				insertCustomerProducts: [product({ id: "cp_new" })],
			}),
			memory: { customer: memoryOf([product({ id: "cp_a" })]) },
		});
		expect(idsOf(customer.customerProducts)).toEqual(["cp_a", "cp_new"]);
		expect(idsOf(customer.customerPrices)).toEqual([
			"cus_price_cp_a",
			"cus_price_cp_new",
		]);
		expect(idsOf(customer.customerEntitlements)).toEqual([
			"grant_cp_a",
			"grant_cp_new",
		]);
	});

	test("a product inserted on an entity lands only in that entity's part", async () => {
		const applied = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				insertCustomerProducts: [product({ id: "cp_seat", onEntity: true })],
			}),
			memory: {
				customer: memoryOf([product({ id: "cp_a" })]),
				entities: [entityMemory({ entity: workerEntity })],
			},
		});
		const entityPart = entityPartIn({ applied, entityId: "ent_1" });
		expect(idsOf(entityPart.customerProducts)).toEqual(["cp_seat"]);
		expect(idsOf(entityPart.customerPrices)).toEqual(["cus_price_cp_seat"]);
		expect(idsOf(entityPart.customerEntitlements)).toEqual(["grant_cp_seat"]);
		expect(idsOf(applied.customer.customerProducts)).toEqual(["cp_a"]);
		expect(idsOf(applied.customer.customerEntitlements)).toEqual([
			"grant_cp_a",
		]);
	});

	test("a patch swaps items in place: the old grant goes with its rollovers, the old price goes, the rest stays", async () => {
		const patched = productWithRollover("cp_a");
		const sibling = productWithRollover("cp_b");
		const before = memoryOf([patched, sibling]);
		const [oldPrice] = patched.customer_prices;
		if (!oldPrice) throw new Error("fixture has no price");

		const { customer } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				patchCustomerProducts: [
					{
						customerProduct: patched,
						insertCustomerEntitlements: [
							grantWithRollovers({
								id: "grant_cp_a_v2",
								customerProductId: "cp_a",
								max: null,
								carried: [{ id: "ro_cp_a_v2", balance: 2, expiresAt: 1 }],
							}),
						],
						insertCustomerPrices: [
							customerPrice({ priceId: "cp_a_v2", customerProductId: "cp_a" }),
						],
						deleteCustomerPrices: [oldPrice],
						deleteCustomerEntitlements: [firstGrantOf(patched)],
					},
				],
			}),
			memory: { customer: before },
		});

		expect(idsOf(customer.customerProducts)).toEqual(["cp_a", "cp_b"]);
		expect(
			idsOf(rowsOwnedBy({ state: customer, productId: "cp_a" }).grants),
		).toEqual(["grant_cp_a_v2"]);
		expect(
			idsOf(rowsOwnedBy({ state: customer, productId: "cp_a" }).prices),
		).toEqual(["cus_price_cp_a_v2"]);
		expect(idsOf(customer.rollovers)).toEqual(["ro_cp_b", "ro_cp_a_v2"]);
		expect(rowsOwnedBy({ state: customer, productId: "cp_b" })).toEqual(
			rowsOwnedBy({ state: before, productId: "cp_b" }),
		);
	});

	test("a product update replaces the columns it sets and leaves other products alone", async () => {
		const before = memoryOf([product({ id: "cp_a" }), product({ id: "cp_b" })]);
		const { customer } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				updateCustomerProducts: [
					{
						customerProduct: product({ id: "cp_a" }),
						updates: {
							status: CusProductStatus.Expired,
							subscription_ids: ["sub_2"],
							ended_at: 1_800_000_000_000,
						},
					},
				],
			}),
			memory: { customer: before },
		});
		const [updated, untouched] = customer.customerProducts;
		expect(updated).toEqual({
			...before.customerProducts[0],
			status: CusProductStatus.Expired,
			subscription_ids: ["sub_2"],
			ended_at: 1_800_000_000_000,
		});
		expect(untouched).toEqual(before.customerProducts[1]);
	});

	test("a deleted product takes its prices, grants and their rollovers with it; a sibling is untouched", async () => {
		const before = memoryOf([
			productWithRollover("cp_a"),
			productWithRollover("cp_b"),
		]);
		const { customer } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				deleteCustomerProducts: [productWithRollover("cp_a")],
			}),
			memory: { customer: before },
		});
		expect(idsOf(customer.customerProducts)).toEqual(["cp_b"]);
		expect(idsOf(customer.customerPrices)).toEqual(["cus_price_cp_b"]);
		expect(idsOf(customer.customerEntitlements)).toEqual(["grant_cp_b"]);
		expect(idsOf(customer.rollovers)).toEqual(["ro_cp_b"]);
		expect(rowsOwnedBy({ state: customer, productId: "cp_b" })).toEqual(
			rowsOwnedBy({ state: before, productId: "cp_b" }),
		);
	});

	test("a grant a patch deletes and its product's delete cascades to is deleted once", async () => {
		const doomed = productWithRollover("cp_a");
		const { customer, mutation } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				patchCustomerProducts: [
					{
						customerProduct: doomed,
						insertCustomerEntitlements: [],
						insertCustomerPrices: [],
						deleteCustomerPrices: [],
						deleteCustomerEntitlements: [firstGrantOf(doomed)],
					},
				],
				deleteCustomerProducts: [doomed],
			}),
			memory: { customer: memoryOf([doomed]) },
		});
		const deletes = (mutation?.changes ?? []).flatMap((change) =>
			change.op === "delete" ? [`${change.table}:${change.id}`] : [],
		);
		expect(deletes).toEqual([
			"rollovers:ro_cp_a",
			"customerEntitlements:grant_cp_a",
			"customerPrices:cus_price_cp_a",
			"customerProducts:cp_a",
		]);
		expect(customer.customerProducts).toEqual([]);
		expect(customer.customerEntitlements).toEqual([]);
		expect(customer.rollovers).toEqual([]);
	});

	test("an update or increment of a grant deleted earlier in the plan changes nothing", async () => {
		const doomed = product({ id: "cp_a" });
		const { customer, mutation } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				deleteCustomerProducts: [doomed],
				updateCustomerEntitlements: [
					{
						customerEntitlement: firstGrantOf(doomed),
						updates: { next_reset_at: 1_800_000_000_000 },
					},
					{ customerEntitlement: firstGrantOf(doomed), balanceChange: 5 },
				],
			}),
			memory: { customer: memoryOf([doomed]) },
		});
		expect(
			(mutation?.changes ?? []).every((change) => change.op === "delete"),
		).toBe(true);
		expect(customer.customerEntitlements).toEqual([]);
	});
});
