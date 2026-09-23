import { describe, expect, test } from "bun:test";
import {
	firstGrantOf,
	newCustomer,
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
	rowById,
} from "./workerMemory.js";

describe("a plan across the customer and an entity in worker memory", () => {
	test("each owner's part holds exactly its own result", async () => {
		const customer = customerMemory({
			customerProducts: [product({ id: "cp_a" }), product({ id: "cp_b" })],
		});
		const entityPart = entityMemory({ entity: workerEntity });

		const applied = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				updateCustomer: { customer: newCustomer, updates: { name: "Ada" } },
				insertCustomerProducts: [product({ id: "cp_seat", onEntity: true })],
				deleteCustomerProducts: [product({ id: "cp_a" })],
				updateCustomerEntitlements: [
					{
						customerEntitlement: firstGrantOf(product({ id: "cp_b" })),
						balanceChange: 5,
					},
				],
			}),
			memory: { customer, entities: [entityPart] },
		});

		expect(applied.customer.customer.name).toBe("Ada");
		expect(idsOf(applied.customer.customerProducts)).toEqual(["cp_b"]);
		expect(idsOf(applied.customer.customerPrices)).toEqual(["cus_price_cp_b"]);
		expect(idsOf(applied.customer.customerEntitlements)).toEqual([
			"grant_cp_b",
		]);
		expect(
			rowById({ rows: applied.customer.customerEntitlements, id: "grant_cp_b" })
				.balance,
		).toBe(105);

		const entityState = entityPartIn({ applied, entityId: "ent_1" });
		expect(entityState.entity).toEqual(entityPart.entity);
		expect(idsOf(entityState.customerProducts)).toEqual(["cp_seat"]);
		expect(idsOf(entityState.customerPrices)).toEqual(["cus_price_cp_seat"]);
		expect(idsOf(entityState.customerEntitlements)).toEqual(["grant_cp_seat"]);

		expect(applied.customer.revision).toBe(customer.revision + 1);
		expect(entityState.revision).toBe(customer.revision + 1);
	});
});
