import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	ErrCode,
	type FullCusProduct,
	type FullProduct,
	type Price,
	type RecaseError,
} from "@autumn/shared";
import chalk from "chalk";
import { assertStripeSubscriptionLinkedToCustomer } from "@/internal/billing/v2/actions/setPlans/errors/subscriptionScope/assertStripeSubscriptionLinkedToCustomer";
import { handleStripeSubscriptionScopeErrors } from "@/internal/billing/v2/actions/setPlans/errors/subscriptionScope/handleStripeSubscriptionScopeErrors";
import {
	planCustomerProduct,
	planProduct,
	SCHEDULE_A,
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

const SCHEDULE_B = "sub_sched_b";

const scheduledProOnB = planCustomerProduct({
	id: "cus_prod_pro_b_scheduled",
	product: pro,
	scheduledIds: [SCHEDULE_B],
});
const seatsOnBSchedule = planCustomerProduct({
	id: "cus_prod_seats_b",
	product: seats,
	subscriptionIds: [SUBSCRIPTION_B],
	scheduledIds: [SCHEDULE_B],
});

const withPriceConfig = (
	product: FullProduct,
	config: Partial<Price["config"]>,
): FullProduct => ({
	...product,
	prices: product.prices.map(
		(price) => ({ ...price, config: { ...price.config, ...config } }) as Price,
	),
});

const oneOffMain = withPriceConfig(planProduct({ id: "setup_fee" }), {
	interval: BillingInterval.OneOff,
});
const unlinkedOneOffMain = planCustomerProduct({
	id: "cus_prod_setup_fee",
	product: oneOffMain,
});

const freeInUsdPaidInEur = withPriceConfig(planProduct({ id: "starter" }), {
	amount: 0,
	base_currency: "usd",
	currencies: { eur: { amount: 10 } },
} as Partial<Price["config"]>);

const thrownBy = (check: () => void) => {
	try {
		check();
	} catch (error) {
		return error as RecaseError;
	}
};

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
			"seats is already billed on another subscription. Edit the seats subscription to change it.",
		);
	});

	test("rejects a paid plan that is billed outside any subscription", () => {
		expect(
			checkScope({
				existingCustomerProducts: [proOnA, unlinkedCredits],
				requestedProducts: [pro, credits],
			}),
		).toThrow(
			"credits is billed outside any Stripe subscription. It can't be changed from a subscription.",
		);
	});

	test("rejects a main plan whose group is live on another subscription", () => {
		expect(
			checkScope({
				existingCustomerProducts: [proOnB, seatsOnB],
				requestedProducts: [premium],
			}),
		).toThrow(
			"Adding premium would replace pro, which is billed on another subscription. Edit the pro subscription to change it.",
		);
	});

	test("the conflict error names the subscription to switch to for the dashboard", () => {
		const thrown = (() => {
			try {
				checkScope({
					existingCustomerProducts: [proOnB, seatsOnB],
					requestedProducts: [premium],
				})();
			} catch (error) {
				return error as RecaseError;
			}
		})();

		expect(thrown?.details).toEqual({
			type: "plan_on_another_subscription",
			conflict: "replaces",
			requested_plan_name: "premium",
			conflicting_plan_name: "pro",
			stripe_subscription_id: SUBSCRIPTION_B,
			subscription_plan_name: "pro",
		});
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
			"The pro subscription bills in EUR, but these plans bill in USD. Plans on one subscription must share a currency.",
		);
	});

	test("names the subscription of a plan billed on its schedule", () => {
		const thrown = thrownBy(
			checkScope({
				existingCustomerProducts: [proOnA, seatsOnBSchedule, scheduledProOnB],
				requestedProducts: [pro],
			}),
		);

		expect(thrown?.details).toMatchObject({
			type: "plan_on_another_subscription",
			conflict: "already_billed",
			stripe_subscription_id: SUBSCRIPTION_B,
		});
	});

	test("keeps the outside-subscription error for a plan on an unknown schedule", () => {
		const scheduledProElsewhere = planCustomerProduct({
			id: "cus_prod_pro_elsewhere",
			product: pro,
			scheduledIds: [SCHEDULE_A],
		});

		expect(
			thrownBy(
				checkScope({
					existingCustomerProducts: [seatsOnB, scheduledProElsewhere],
					requestedProducts: [pro],
				}),
			)?.details,
		).toMatchObject({ type: "plan_outside_subscription" });
	});

	test("lets a main plan sit beside a one-off main plan billed outside the subscription", () => {
		expect(
			checkScope({
				existingCustomerProducts: [proOnA, unlinkedOneOffMain],
				requestedProducts: [premium],
			}),
		).not.toThrow();
	});

	test("rejects a plan that is free in its base currency but paid in the requested one", () => {
		expect(
			checkScope({
				existingCustomerProducts: [proOnA],
				requestedProducts: [freeInUsdPaidInEur],
				currency: "eur",
				stripeSubscriptionCurrency: "usd",
			}),
		).toThrow("Plans on one subscription must share a currency.");
	});

	test("the currency error reports both currencies in one casing", () => {
		expect(
			thrownBy(
				checkScope({
					existingCustomerProducts: [proOnA],
					requestedProducts: [premium],
					currency: "USD",
					stripeSubscriptionCurrency: "eur",
				}),
			)?.details,
		).toMatchObject({
			subscription_currency: "eur",
			requested_currency: "usd",
		});
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
					"This subscription no longer has any of this customer's plans. Pick another subscription to continue.",
			}),
		);
	});
});
