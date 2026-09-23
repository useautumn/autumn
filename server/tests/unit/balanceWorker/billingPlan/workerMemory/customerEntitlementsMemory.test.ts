import { describe, expect, test } from "bun:test";
import type { UpdateCustomerEntitlement } from "@autumn/shared";
import {
	firstGrantOf,
	minimalLooseGrant,
	planOf,
	product,
} from "../billingPlanFixtures.js";
import {
	applyPlanToWorkerMemory,
	customerMemory,
	rowById,
} from "./workerMemory.js";

const productA = () => product({ id: "cp_a" });
const productB = () => product({ id: "cp_b" });

const memory = () => ({
	customer: customerMemory({ customerProducts: [productA(), productB()] }),
});

type GrantUpdate = Omit<UpdateCustomerEntitlement, "customerEntitlement">;

const updatesOnA = (updates: GrantUpdate[]) =>
	updates.map((update) => ({
		customerEntitlement: firstGrantOf(productA()),
		...update,
	}));

const deltas = (entries: { grantId: string; delta: number }[]) => ({
	deltas: entries.map(({ grantId, delta }) => ({
		cusEntId: grantId,
		featureId: "messages",
		delta,
	})),
});

const grantIn = ({
	customer,
	id,
}: {
	customer: ReturnType<typeof customerMemory>;
	id: string;
}) => rowById({ rows: customer.customerEntitlements, id });

describe("grant facets in worker memory", () => {
	test("a grant update replaces the columns it sets, and nothing else", async () => {
		const before = memory().customer;
		const { customer } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				updateCustomerEntitlements: updatesOnA([
					{ updates: { next_reset_at: 1_800_000_000_000, adjustment: 5 } },
				]),
			}),
			memory: { customer: before },
		});
		expect(grantIn({ customer, id: "grant_cp_a" })).toEqual({
			...grantIn({ customer: before, id: "grant_cp_a" }),
			next_reset_at: 1_800_000_000_000,
			adjustment: 5,
		});
		expect(grantIn({ customer, id: "grant_cp_b" })).toEqual(
			grantIn({ customer: before, id: "grant_cp_b" }),
		);
	});

	test("a balance change moves the balance by its delta", async () => {
		const { customer } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				updateCustomerEntitlements: updatesOnA([{ balanceChange: -30 }]),
			}),
			memory: memory(),
		});
		expect(grantIn({ customer, id: "grant_cp_a" }).balance).toBe(70);
	});

	test("auto top-up deltas are not the worker's yet: they leave its memory untouched", async () => {
		const { customer, mutation } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				updateCustomerEntitlements: updatesOnA([{ balanceChange: 1 }]),
				autoTopupRebalance: deltas([
					{ grantId: "grant_cp_a", delta: 40 },
					{ grantId: "grant_cp_b", delta: -15 },
				]),
			}),
			memory: memory(),
		});
		expect(grantIn({ customer, id: "grant_cp_a" }).balance).toBe(101);
		expect(grantIn({ customer, id: "grant_cp_b" }).balance).toBe(100);
		expect(mutation?.changes).toHaveLength(1);
	});

	test("a loose grant is held beside the products, with the table's defaults", async () => {
		const { customer } = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				insertCustomerEntitlements: [minimalLooseGrant()],
			}),
			memory: memory(),
		});
		expect(grantIn({ customer, id: "grant_loose" })).toEqual({
			...minimalLooseGrant(),
			customer_product_id: null,
			internal_entity_id: null,
			balance: 0,
			adjustment: 0,
			additional_balance: 0,
			separate_interval: false,
			usage_allowed: false,
			next_reset_at: null,
			expires_at: null,
			external_id: null,
		});
		expect(customer.customerEntitlements).toHaveLength(3);
	});
});
