import { describe, expect, test } from "bun:test";
import { BillingInterval, type FullCusProduct } from "@autumn/shared";
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
			"annual_addon is billed per year, but subscription sub_a is billed per month. Plans on one subscription must share a billing interval.",
		);
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
