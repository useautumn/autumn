import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * No-card trials run by Autumn (no Stripe subscription until they convert).
 *
 * Each test sets up one customer in a state to inspect in the dashboard and Stripe:
 * - qa-nct-trialing:        no card, mid-trial (try upgrade / downgrade / cancel / extend in the UI)
 * - qa-nct-trialing-card:   card on file, mid-trial (try upgrade / downgrade / remove trial in the UI)
 * - qa-nct-expired:         trial ended with no card → back on the free default, no Stripe sub
 * - qa-nct-converted:       card added mid-trial, trial ended → billed $20, one Stripe sub
 * - qa-nct-declined:        declining card, trial ended → trial expired, no Stripe sub
 * - qa-nct-entities:        two entities on the trial, trial ended with a card → one Stripe sub
 * - qa-nct-paid-default:    signed up onto a paid default plan → Autumn-only trial, no Stripe sub
 */

const TRIAL_DAYS = 7;
const DAYS_PAST_TRIAL_END = TRIAL_DAYS + 1;

const noCardProTrial = () =>
	products.proWithTrial({
		id: "pro-trial",
		items: [items.monthlyMessages({ includedUsage: 500 })],
		trialDays: TRIAL_DAYS,
		cardRequired: false,
	});

const freeDefault = () =>
	products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 50 })],
		isDefault: true,
	});

const premium = () =>
	products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 2000 })],
	});

const basic = () =>
	products.base({
		id: "basic",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 10 }),
		],
	});

test(`${chalk.yellowBright("no-card trials: mid-trial, no card")}`, async () => {
	await initScenario({
		customerId: "qa-nct-trialing",
		setup: [
			s.customer({}),
			s.products({
				list: [noCardProTrial(), premium(), basic(), freeDefault()],
			}),
		],
		actions: [s.billing.attach({ productId: "pro-trial" })],
	});
});

test(`${chalk.yellowBright("no-card trials: mid-trial, card on file")}`, async () => {
	await initScenario({
		customerId: "qa-nct-trialing-card",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({
				list: [noCardProTrial(), premium(), basic(), freeDefault()],
			}),
		],
		actions: [s.billing.attach({ productId: "pro-trial" })],
	});
});

test(`${chalk.yellowBright("no-card trials: trial ended without a card")}`, async () => {
	await initScenario({
		customerId: "qa-nct-expired",
		setup: [
			s.customer({}),
			s.products({ list: [noCardProTrial(), freeDefault()] }),
		],
		actions: [
			s.billing.attach({ productId: "pro-trial" }),
			s.advanceTestClock({ days: DAYS_PAST_TRIAL_END }),
		],
	});
});

test(`${chalk.yellowBright("no-card trials: card added mid-trial, converted at trial end")}`, async () => {
	await initScenario({
		customerId: "qa-nct-converted",
		setup: [
			s.customer({}),
			s.products({ list: [noCardProTrial(), freeDefault()] }),
		],
		actions: [
			s.billing.attach({ productId: "pro-trial" }),
			s.attachPaymentMethod({ type: "success" }),
			s.advanceTestClock({ days: DAYS_PAST_TRIAL_END }),
		],
	});
});

test(`${chalk.yellowBright("no-card trials: declining card at trial end")}`, async () => {
	await initScenario({
		customerId: "qa-nct-declined",
		setup: [
			s.customer({}),
			s.products({ list: [noCardProTrial(), freeDefault()] }),
		],
		actions: [
			s.billing.attach({ productId: "pro-trial" }),
			s.attachPaymentMethod({ type: "fail" }),
			s.advanceTestClock({ days: DAYS_PAST_TRIAL_END }),
		],
	});
});

test(`${chalk.yellowBright("no-card trials: two entities convert into one sub")}`, async () => {
	await initScenario({
		customerId: "qa-nct-entities",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [noCardProTrial()] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: "pro-trial", entityIndex: 0 }),
			s.billing.attach({ productId: "pro-trial", entityIndex: 1 }),
			s.advanceTestClock({ days: DAYS_PAST_TRIAL_END }),
		],
	});
});

test(`${chalk.yellowBright("no-card trials: signup onto a paid default plan")}`, async () => {
	await initScenario({
		customerId: "qa-nct-paid-default",
		setup: [
			s.products({
				list: [
					products.defaultTrial({
						id: "paid-default",
						items: [items.monthlyMessages({ includedUsage: 100 })],
						trialDays: TRIAL_DAYS,
						cardRequired: false,
					}),
				],
			}),
			s.customer({ withDefault: true }),
		],
		actions: [],
	});
});
