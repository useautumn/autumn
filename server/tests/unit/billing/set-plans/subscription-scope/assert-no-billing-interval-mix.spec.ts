import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	type FullCusProduct,
	type Price,
	type RecaseError,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import chalk from "chalk";
import { assertNoBillingIntervalMix } from "@/internal/billing/v2/actions/setPlans/errors/subscriptionScope/assertNoBillingIntervalMix";
import {
	planCustomerProduct,
	planProduct,
	SUBSCRIPTION_A,
	SUBSCRIPTION_B,
	scopeOver,
} from "./subscriptionScopeFixtures";

const proOnA = planCustomerProduct({
	id: "cus_prod_pro",
	product: planProduct({ id: "pro" }),
	subscriptionIds: [SUBSCRIPTION_A],
});
const annualSeatsOnB = planCustomerProduct({
	id: "cus_prod_seats_b",
	product: planProduct({
		id: "seats",
		group: "",
		isAddOn: true,
		interval: BillingInterval.Year,
	}),
	subscriptionIds: [SUBSCRIPTION_B],
});
const incoming = ({
	id,
	interval,
}: {
	id: string;
	interval: BillingInterval;
}) =>
	planCustomerProduct({
		id: `cus_prod_${id}_new`,
		product: planProduct({ id, group: "", isAddOn: true, interval }),
	});

const pricedEvery = ({
	id,
	interval,
	intervalCount = 1,
}: {
	id: string;
	interval: BillingInterval;
	intervalCount?: number;
}): Price => {
	const price = prices.createFixed({ id });
	return {
		...price,
		config: { ...price.config, interval, interval_count: intervalCount },
	} as Price;
};

const keptOnA = ({ id, planPrices }: { id: string; planPrices: Price[] }) =>
	planCustomerProduct({
		id: `cus_prod_${id}`,
		product: { ...planProduct({ id }), prices: planPrices },
		subscriptionIds: [SUBSCRIPTION_A],
	});

const checkKeptMix = ({
	kept,
	incomingPrices,
}: {
	kept: FullCusProduct;
	incomingPrices: Price[];
}) =>
	assertNoBillingIntervalMix({
		stripeSubscriptionScope: scopeOver({ customerProducts: [kept] }),
		currentCustomerProducts: [kept],
		outgoingCustomerProducts: [],
		incomingCustomerProducts: [
			planCustomerProduct({
				id: "cus_prod_addon_new",
				product: {
					...planProduct({ id: "addon", group: "", isAddOn: true }),
					prices: incomingPrices,
				},
			}),
		],
	});

const checkMix =
	({
		outgoingCustomerProducts = [],
		incomingCustomerProducts,
		scoped = true,
	}: {
		outgoingCustomerProducts?: FullCusProduct[];
		incomingCustomerProducts: FullCusProduct[];
		scoped?: boolean;
	}) =>
	() =>
		assertNoBillingIntervalMix({
			stripeSubscriptionScope: scoped
				? scopeOver({ customerProducts: [proOnA] })
				: undefined,
			currentCustomerProducts: [proOnA, annualSeatsOnB],
			outgoingCustomerProducts,
			incomingCustomerProducts,
		});

describe(chalk.yellowBright("assertNoBillingIntervalMix"), () => {
	test("rejects a yearly plan joining a monthly subscription", () => {
		expect(
			checkMix({
				incomingCustomerProducts: [
					incoming({ id: "annual_addon", interval: BillingInterval.Year }),
				],
			}),
		).toThrow(
			"annual_addon bills every year, but the pro subscription bills every month. Plans on one subscription must share a billing interval.",
		);
	});

	test("the interval error names both intervals and the subscription for the dashboard", () => {
		const thrown = (() => {
			try {
				checkMix({
					incomingCustomerProducts: [
						incoming({ id: "annual_addon", interval: BillingInterval.Year }),
					],
				})();
			} catch (error) {
				return error as RecaseError;
			}
		})();

		expect(thrown?.details).toEqual({
			type: "billing_interval_mismatch",
			requested_plan_name: "annual_addon",
			requested_interval: "every year",
			subscription_plan_name: "pro",
			subscription_interval: "every month",
		});
	});

	test("allows a plan on the subscription's interval", () => {
		expect(
			checkMix({
				incomingCustomerProducts: [
					incoming({ id: "monthly_addon", interval: BillingInterval.Month }),
				],
			}),
		).not.toThrow();
	});

	test("allows a new interval when every paid plan on the subscription is replaced", () => {
		expect(
			checkMix({
				outgoingCustomerProducts: [proOnA],
				incomingCustomerProducts: [
					incoming({ id: "pro_annual", interval: BillingInterval.Year }),
				],
			}),
		).not.toThrow();
	});

	test("allows a quarterly plan on a subscription that bills every three months", () => {
		expect(() =>
			checkKeptMix({
				kept: keptOnA({
					id: "pro",
					planPrices: [
						pricedEvery({
							id: "price_pro",
							interval: BillingInterval.Month,
							intervalCount: 3,
						}),
					],
				}),
				incomingPrices: [
					pricedEvery({ id: "price_addon", interval: BillingInterval.Quarter }),
				],
			}),
		).not.toThrow();
	});

	test("allows a monthly plan when a kept plan already bills monthly beside yearly", () => {
		expect(() =>
			checkKeptMix({
				kept: keptOnA({
					id: "pro",
					planPrices: [
						pricedEvery({
							id: "price_pro_year",
							interval: BillingInterval.Year,
						}),
						pricedEvery({
							id: "price_pro_month",
							interval: BillingInterval.Month,
						}),
					],
				}),
				incomingPrices: [
					pricedEvery({ id: "price_addon", interval: BillingInterval.Month }),
				],
			}),
		).not.toThrow();
	});

	test("does nothing without a target subscription", () => {
		expect(
			checkMix({
				incomingCustomerProducts: [
					incoming({ id: "annual_addon", interval: BillingInterval.Year }),
				],
				scoped: false,
			}),
		).not.toThrow();
	});
});
