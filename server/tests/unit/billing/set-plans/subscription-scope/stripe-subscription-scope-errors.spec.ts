import { describe, expect, test } from "bun:test";
import { ErrCode, type FullCusProduct, type FullProduct } from "@autumn/shared";
import chalk from "chalk";
import { assertStripeSubscriptionLinkedToCustomer } from "@/internal/billing/v2/actions/setPlans/errors/subscriptionScope/assertStripeSubscriptionLinkedToCustomer";
import { handleStripeSubscriptionScopeErrors } from "@/internal/billing/v2/actions/setPlans/errors/subscriptionScope/handleStripeSubscriptionScopeErrors";
import {
	planCustomerProduct,
	planProduct,
	SUBSCRIPTION_A,
	SUBSCRIPTION_B,
	scheduleBillingContext,
	scopeOver,
} from "./subscriptionScopeFixtures";

const pro = planProduct({ id: "pro" });
const premium = planProduct({ id: "premium" });
const seats = planProduct({ id: "seats", group: "", isAddOn: true });
const credits = planProduct({ id: "credits", group: "", isAddOn: true });

const proOnA = planCustomerProduct({
	id: "cus_prod_pro_a",
	product: pro,
	subscriptionIds: [SUBSCRIPTION_A],
});
const proOnB = planCustomerProduct({
	id: "cus_prod_pro_b",
	product: pro,
	subscriptionIds: [SUBSCRIPTION_B],
});
const seatsOnB = planCustomerProduct({
	id: "cus_prod_seats_b",
	product: seats,
	subscriptionIds: [SUBSCRIPTION_B],
});
const unlinkedCredits = planCustomerProduct({
	id: "cus_prod_credits",
	product: credits,
});

const checkScope =
	({
		existingCustomerProducts,
		requestedProducts,
		scoped = true,
		currency,
		stripeSubscriptionCurrency,
	}: {
		existingCustomerProducts: FullCusProduct[];
		requestedProducts: FullProduct[];
		scoped?: boolean;
		currency?: string;
		stripeSubscriptionCurrency?: string;
	}) =>
	() =>
		handleStripeSubscriptionScopeErrors({
			billingContext: scheduleBillingContext({
				existingCustomerProducts,
				requestedProducts,
				stripeSubscriptionScope: scoped
					? scopeOver({
							customerProducts: existingCustomerProducts.filter(
								({ subscription_ids }) =>
									subscription_ids?.includes(SUBSCRIPTION_A),
							),
						})
					: undefined,
				currency,
				stripeSubscriptionCurrency,
			}),
		});

describe(chalk.yellowBright("set_plans target subscription guards"), () => {
	test("rejects a plan already billed on another subscription", () => {
		expect(
			checkScope({
				existingCustomerProducts: [proOnA, seatsOnB],
				requestedProducts: [pro, seats],
			}),
		).toThrow(
			"seats is already billed on subscription sub_b, so it can't be edited from subscription sub_a.",
		);
	});

	test("rejects a paid plan that is billed outside any subscription", () => {
		expect(
			checkScope({
				existingCustomerProducts: [proOnA, unlinkedCredits],
				requestedProducts: [pro, credits],
			}),
		).toThrow(
			"credits is already billed outside any Stripe subscription, so it can't be edited from subscription sub_a.",
		);
	});

	test("rejects a main plan whose group is live on another subscription", () => {
		expect(
			checkScope({
				existingCustomerProducts: [proOnB, seatsOnB],
				requestedProducts: [premium],
			}),
		).toThrow(
			"premium would replace pro, which is billed on subscription sub_b. Plans can't move between subscriptions.",
		);
	});

	test("lets add-ons sit beside another subscription's main plan", () => {
		expect(
			checkScope({
				existingCustomerProducts: [proOnB],
				requestedProducts: [seats],
			}),
		).not.toThrow();
	});

	test("rejects a currency the target subscription doesn't bill in", () => {
		expect(
			checkScope({
				existingCustomerProducts: [proOnA],
				requestedProducts: [premium],
				currency: "usd",
				stripeSubscriptionCurrency: "eur",
			}),
		).toThrow(
			"Subscription sub_a bills in EUR, so plans can't be billed on it in USD.",
		);
	});

	test("does nothing without a target subscription", () => {
		expect(
			checkScope({
				existingCustomerProducts: [proOnB, seatsOnB],
				requestedProducts: [premium, seats],
				scoped: false,
				currency: "usd",
				stripeSubscriptionCurrency: "eur",
			}),
		).not.toThrow();
	});

	test("rejects a target subscription none of the customer's plans use", () => {
		const assertLinked = (stripeSubscriptionId: string) => () =>
			assertStripeSubscriptionLinkedToCustomer({
				customerProducts: [proOnA, seatsOnB],
				stripeSubscriptionId,
			});

		expect(assertLinked(SUBSCRIPTION_B)).not.toThrow();
		expect(assertLinked("sub_other")).toThrow(
			expect.objectContaining({
				code: ErrCode.InvalidRequest,
				message:
					"Subscription sub_other isn't linked to any of this customer's plans.",
			}),
		);
	});
});
