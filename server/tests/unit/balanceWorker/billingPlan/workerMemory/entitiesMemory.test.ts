import { describe, expect, test } from "bun:test";
import { UnsupportedCommandError } from "@autumn/balance-engine";
import { CusProductStatus } from "@autumn/shared";
import {
	minimalLooseGrant,
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

const withHeldEntity = () => ({
	customer: customerMemory({ customerProducts: [product({ id: "cp_a" })] }),
	entities: [
		entityMemory({
			entity: workerEntity,
			customerProducts: [product({ id: "cp_seat", onEntity: true })],
		}),
	],
});

const refusalOf = async (run: Promise<unknown>): Promise<unknown> =>
	run.then(
		() => null,
		(error: unknown) => error,
	);

describe("entity facets in worker memory", () => {
	test("a created entity gets its own part, holding its row and the product provisioned on it", async () => {
		const applied = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				insertEntities: [workerEntity],
				insertCustomerProducts: [product({ id: "cp_seat", onEntity: true })],
			}),
			memory: {
				customer: customerMemory({
					customerProducts: [product({ id: "cp_a" })],
				}),
			},
		});
		const created = entityPartIn({ applied, entityId: "ent_1" });
		expect(created.identity.entityId).toBe("ent_1");
		expect(created.entity).toEqual(workerEntity);
		expect(idsOf(created.customerProducts)).toEqual(["cp_seat"]);
		expect(idsOf(created.customerEntitlements)).toEqual(["grant_cp_seat"]);

		expect(applied.customer.entity).toBeNull();
		expect(idsOf(applied.customer.customerProducts)).toEqual(["cp_a"]);
		expect(idsOf(applied.customer.customerEntitlements)).toEqual([
			"grant_cp_a",
		]);
	});

	test("an update of a held entity's product lands in that entity's part only", async () => {
		const before = withHeldEntity();
		const applied = await applyPlanToWorkerMemory({
			autumnBillingPlan: planOf({
				updateCustomerProducts: [
					{
						customerProduct: product({ id: "cp_seat", onEntity: true }),
						updates: { status: CusProductStatus.Expired },
					},
				],
			}),
			memory: before,
		});
		const [seat] = entityPartIn({
			applied,
			entityId: "ent_1",
		}).customerProducts;
		expect(seat?.status).toBe(CusProductStatus.Expired);
		expect(applied.customer.customerProducts).toEqual(
			before.customer.customerProducts,
		);
	});

	test("a grant for an entity the command does not name is refused, not dropped", async () => {
		const refusal = await refusalOf(
			applyPlanToWorkerMemory({
				autumnBillingPlan: planOf({
					insertCustomerEntitlements: [
						{
							...minimalLooseGrant(),
							internal_entity_id: workerEntity.internal_id,
						},
					],
				}),
				memory: withHeldEntity(),
			}),
		);
		expect(refusal).toBeInstanceOf(UnsupportedCommandError);
		expect(refusal).toMatchObject({
			reason: "billing_plan_row_owner_not_named",
		});
	});

	test("a product on an entity the plan cannot name by id is refused", async () => {
		const refusal = await refusalOf(
			applyPlanToWorkerMemory({
				autumnBillingPlan: planOf({
					insertCustomerProducts: [
						{
							...product({ id: "cp_seat_2", onEntity: true }),
							entity_id: null,
						},
					],
				}),
				memory: withHeldEntity(),
			}),
		);
		expect(refusal).toMatchObject({
			reason: "billing_plan_row_owner_not_named",
		});
	});
});
