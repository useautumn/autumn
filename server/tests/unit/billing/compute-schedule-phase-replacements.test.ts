import { describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";
import chalk from "chalk";
import { computeSchedulePhaseReplacements } from "@/internal/billing/v2/compute/computeSchedulePhaseReplacements";

const customerProduct = ({
	id,
	group = "",
	isAddOn = false,
	internalEntityId = null,
}: {
	id: string;
	group?: string;
	isAddOn?: boolean;
	internalEntityId?: string | null;
}): FullCusProduct =>
	({
		id,
		internal_customer_id: "cus_internal",
		internal_entity_id: internalEntityId,
		product: { id: `prod_${id}`, name: id, group, is_add_on: isAddOn },
	}) as unknown as FullCusProduct;

const planWith = (plan: Partial<AutumnBillingPlan>): AutumnBillingPlan =>
	({
		customerId: "cus",
		insertCustomerProducts: [],
		...plan,
	}) as AutumnBillingPlan;

describe(chalk.yellowBright("computeSchedulePhaseReplacements"), () => {
	test("remaps an expired plan onto the product inserted in its slot", () => {
		const pro = customerProduct({ id: "cp_pro" });
		const ultra = customerProduct({ id: "cp_ultra" });

		const replacements = computeSchedulePhaseReplacements({
			autumnBillingPlan: planWith({
				insertCustomerProducts: [ultra],
				updateCustomerProduct: {
					customerProduct: pro,
					updates: { status: CusProductStatus.Expired },
				},
			}),
		});

		expect(replacements).toEqual([
			{
				oldCustomerProductId: "cp_pro",
				newCustomerProductId: "cp_ultra",
				internalCustomerId: "cus_internal",
				internalEntityId: null,
			},
		]);
	});

	test("leaves an expired plan alone when nothing takes its slot", () => {
		const pro = customerProduct({ id: "cp_pro" });

		const replacements = computeSchedulePhaseReplacements({
			autumnBillingPlan: planWith({
				updateCustomerProduct: {
					customerProduct: pro,
					updates: { status: CusProductStatus.Expired },
				},
			}),
		});

		expect(replacements).toEqual([]);
	});

	test("drops a deleted plan from its phases when nothing takes its slot", () => {
		const scheduled = customerProduct({ id: "cp_scheduled" });

		const replacements = computeSchedulePhaseReplacements({
			autumnBillingPlan: planWith({ deleteCustomerProduct: scheduled }),
		});

		expect(replacements).toEqual([
			{
				oldCustomerProductId: "cp_scheduled",
				newCustomerProductId: null,
				internalCustomerId: "cus_internal",
				internalEntityId: null,
			},
		]);
	});

	test("does not let an add-on inherit a main plan's slot", () => {
		const pro = customerProduct({ id: "cp_pro" });
		const seats = customerProduct({ id: "cp_seats", isAddOn: true });

		const replacements = computeSchedulePhaseReplacements({
			autumnBillingPlan: planWith({
				insertCustomerProducts: [seats],
				updateCustomerProduct: {
					customerProduct: pro,
					updates: { status: CusProductStatus.Expired },
				},
			}),
		});

		expect(replacements).toEqual([]);
	});

	test("keeps entity-scoped plans in their own slot", () => {
		const entityPro = customerProduct({
			id: "cp_entity_pro",
			internalEntityId: "ent_1",
		});
		const customerUltra = customerProduct({ id: "cp_customer_ultra" });

		const replacements = computeSchedulePhaseReplacements({
			autumnBillingPlan: planWith({
				insertCustomerProducts: [customerUltra],
				updateCustomerProduct: {
					customerProduct: entityPro,
					updates: { status: CusProductStatus.Expired },
				},
			}),
		});

		expect(replacements).toEqual([]);
	});
});
