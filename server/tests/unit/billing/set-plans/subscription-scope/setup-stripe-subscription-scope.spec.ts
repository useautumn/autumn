import { describe, expect, test } from "bun:test";
import type { FullCustomer } from "@autumn/shared";
import chalk from "chalk";
import { setupStripeSubscriptionScope } from "@/internal/billing/v2/actions/setPlans/subscriptionScope/setupStripeSubscriptionScope";
import {
	planCustomerProduct,
	planProduct,
	SCHEDULE_A,
	SUBSCRIPTION_A,
	SUBSCRIPTION_B,
} from "./subscriptionScopeFixtures";

const proOnA = planCustomerProduct({
	id: "cus_prod_pro",
	product: planProduct({ id: "pro" }),
	subscriptionIds: [SUBSCRIPTION_A],
});
const premiumScheduledOnA = planCustomerProduct({
	id: "cus_prod_premium",
	product: planProduct({ id: "premium" }),
	scheduledIds: [SCHEDULE_A],
});
const seatsOnB = planCustomerProduct({
	id: "cus_prod_seats",
	product: planProduct({ id: "seats", group: "", isAddOn: true }),
	subscriptionIds: [SUBSCRIPTION_B],
});
const freeAddOn = planCustomerProduct({
	id: "cus_prod_free",
	product: planProduct({ id: "free", group: "", isAddOn: true, paid: false }),
});
const unlinkedPaid = planCustomerProduct({
	id: "cus_prod_manual",
	product: planProduct({ id: "manual", group: "", isAddOn: true }),
});

const fullCustomer = {
	customer_products: [
		proOnA,
		premiumScheduledOnA,
		seatsOnB,
		freeAddOn,
		unlinkedPaid,
	],
} as unknown as FullCustomer;

describe(chalk.yellowBright("setupStripeSubscriptionScope"), () => {
	test("covers the target subscription, its schedule and free plans only", () => {
		const scope = setupStripeSubscriptionScope({
			fullCustomer,
			stripeSubscriptionId: SUBSCRIPTION_A,
			stripeScheduleId: SCHEDULE_A,
		});

		expect(scope).toEqual({
			stripeSubscriptionId: SUBSCRIPTION_A,
			customerProductIds: ["cus_prod_pro", "cus_prod_premium", "cus_prod_free"],
			otherStripeSubscriptionIds: [SUBSCRIPTION_B],
		});
	});

	test("is unset without a target subscription", () => {
		expect(
			setupStripeSubscriptionScope({
				fullCustomer,
				stripeSubscriptionId: undefined,
				stripeScheduleId: SCHEDULE_A,
			}),
		).toBeUndefined();
	});
});
