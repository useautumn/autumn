import { describe, expect, test } from "bun:test";
import { entities } from "@tests/utils/fixtures/db/entities.js";
import { insertEntitiesToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/entities/insertEntitiesToPlanOps.js";
import { planOf, workerEntity } from "../../billingPlanFixtures.js";

describe("insertEntitiesToPlanOps", () => {
	test("a plan that creates no entity inserts none", () => {
		expect(insertEntitiesToPlanOps({ autumnBillingPlan: planOf({}) })).toEqual(
			[],
		);
		expect(
			insertEntitiesToPlanOps({
				autumnBillingPlan: planOf({ insertEntities: [] }),
			}),
		).toEqual([]);
	});

	test("each entity is one insert of its whole row, in order", () => {
		const second = entities.create({ id: "ent_2", featureId: "seats" });
		expect(
			insertEntitiesToPlanOps({
				autumnBillingPlan: planOf({ insertEntities: [workerEntity, second] }),
			}),
		).toEqual([
			{ op: "insert", table: "entity", row: workerEntity },
			{ op: "insert", table: "entity", row: second },
		]);
	});

	test("fields that are not entity columns are cut", () => {
		const withJoinedRows = { ...workerEntity, customer_products: [] };
		const [op] = insertEntitiesToPlanOps({
			autumnBillingPlan: planOf({ insertEntities: [withJoinedRows] }),
		});
		expect(op).toEqual({ op: "insert", table: "entity", row: workerEntity });
	});
});
