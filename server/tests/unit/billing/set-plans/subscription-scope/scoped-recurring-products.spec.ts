import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import { resolveSetPlansRecurringProducts } from "@/internal/billing/v2/actions/setPlans/utils/resolveSetPlansRecurringProducts";
import {
	planCustomerProduct,
	planProduct,
	SUBSCRIPTION_A,
	SUBSCRIPTION_B,
	scheduleBillingContext,
	scopeOver,
} from "./subscriptionScopeFixtures";

const seats = planProduct({ id: "seats", group: "", isAddOn: true });
const pro = planProduct({ id: "pro" });
const proOnA = planCustomerProduct({
	id: "cus_prod_pro",
	product: pro,
	subscriptionIds: [SUBSCRIPTION_A],
});
const seatsOnB = planCustomerProduct({
	id: "cus_prod_seats",
	product: seats,
	subscriptionIds: [SUBSCRIPTION_B],
});

const outgoingIds = ({ scoped }: { scoped: boolean }) =>
	resolveSetPlansRecurringProducts({
		billingContext: scheduleBillingContext({
			existingCustomerProducts: [proOnA, seatsOnB],
			requestedProducts: [planProduct({ id: "premium" }), seats],
			stripeSubscriptionScope: scoped
				? scopeOver({ customerProducts: [proOnA] })
				: undefined,
		}),
	}).recurringOutgoing.map(({ id }) => id);

describe(
	chalk.yellowBright(
		"resolveSetPlansRecurringProducts with a target subscription",
	),
	() => {
		test("never ends a plan billed on another subscription", () => {
			expect(outgoingIds({ scoped: true })).toEqual(["cus_prod_pro"]);
		});

		test("without a target, every claimed plan ends as before", () => {
			expect(outgoingIds({ scoped: false })).toEqual([
				"cus_prod_pro",
				"cus_prod_seats",
			]);
		});
	},
);
