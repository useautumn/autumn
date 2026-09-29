import { describe, expect, test } from "bun:test";
import { StaleMutationError } from "@autumn/balance-engine";
import { type AutumnBillingPlan, CusProductStatus } from "@autumn/shared";
import {
	firstGrantOf,
	newCustomer,
	planOf,
	product,
} from "../billingPlanFixtures.js";
import { applyPlanToWorkerMemory, customerMemory } from "./workerMemory.js";

/** Memory holds cp_a; cp_gone is a row Postgres has but the worker's copy does not. */
const staleRefusalOf = (autumnBillingPlan: AutumnBillingPlan) =>
	expect(
		applyPlanToWorkerMemory({
			autumnBillingPlan,
			memory: {
				customer: customerMemory({
					customerProducts: [product({ id: "cp_a" })],
				}),
			},
		}),
	).rejects.toBeInstanceOf(StaleMutationError);

const missing = () => product({ id: "cp_gone" });

describe("plans against rows the worker does not hold", () => {
	test("an update of a product it does not hold is stale", async () => {
		await staleRefusalOf(
			planOf({
				updateCustomerProducts: [
					{
						customerProduct: missing(),
						updates: { status: CusProductStatus.Expired },
					},
				],
			}),
		);
	});

	test("a delete of a product it does not hold is stale", async () => {
		await staleRefusalOf(planOf({ deleteCustomerProducts: [missing()] }));
	});

	test("an update of a grant it does not hold is stale", async () => {
		await staleRefusalOf(
			planOf({
				updateCustomerEntitlements: [
					{
						customerEntitlement: firstGrantOf(missing()),
						updates: { adjustment: 1 },
					},
				],
			}),
		);
	});

	test("an increment of a grant it does not hold is stale", async () => {
		await staleRefusalOf(
			planOf({
				updateCustomerEntitlements: [
					{ customerEntitlement: firstGrantOf(missing()), balanceChange: 3 },
				],
			}),
		);
	});

	test("a patch deleting a price or grant it does not hold is stale", async () => {
		const held = product({ id: "cp_a" });
		const [missingPrice] = missing().customer_prices;
		if (!missingPrice) throw new Error("fixture has no price");
		const patchDeleting = (
			deletes: Pick<
				NonNullable<AutumnBillingPlan["patchCustomerProducts"]>[number],
				"deleteCustomerPrices" | "deleteCustomerEntitlements"
			>,
		) =>
			planOf({
				patchCustomerProducts: [
					{
						customerProduct: held,
						insertCustomerEntitlements: [],
						insertCustomerPrices: [],
						...deletes,
					},
				],
			});
		await staleRefusalOf(
			patchDeleting({
				deleteCustomerPrices: [missingPrice],
				deleteCustomerEntitlements: [],
			}),
		);
		await staleRefusalOf(
			patchDeleting({
				deleteCustomerPrices: [],
				deleteCustomerEntitlements: [firstGrantOf(missing())],
			}),
		);
	});

	test("an update of a customer other than the one it holds is stale", async () => {
		await staleRefusalOf(
			planOf({
				updateCustomer: {
					customer: { ...newCustomer, internal_id: "cus_internal_other" },
					updates: { name: "Ada" },
				},
			}),
		);
	});
});
