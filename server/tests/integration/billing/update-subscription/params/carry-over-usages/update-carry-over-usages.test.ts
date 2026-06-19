/**
 * TDD test for `carry_over_usages` on billing.update (trial→paid conversion).
 *
 * Bug: converting off a trial via billing.update (free_trial: null) unconditionally
 * carries the trial-period usage onto the new customer product, so a fixed-allowance
 * feature never resets on the fresh paid cycle.
 *
 * Contract under test:
 *   New field:
 *     - carry_over_usages?: { enabled: boolean; feature_ids?: string[] } on billing.update
 *   New behaviors (on UpdatePlan trial→paid conversion):
 *     - param ABSENT          -> carry ALL usage (DEFAULT, back-compat)
 *     - { enabled: false }    -> RESET: balance = full allowance, usage = 0
 *     - { enabled: true, feature_ids: [X] } -> carry only X; other consumables reset
 *
 * Pre-impl red: assertions 1 & 3 fail at the VALUE layer — carry_over_usages is stripped
 *   by the update zod schema, so usage is carried (balance not reset). Assertion 2 (default)
 *   passes immediately, proving the harness is wired correctly.
 * Post-impl green: all pass once the update schema accepts carry_over_usages and the
 *   new-customer-product builder honors it via the shared resolver.
 *
 * Preview parity (preview_update) is covered structurally by the shared schema + compute
 * path; the preview API response does not surface resulting balances, so it is not asserted.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const REDIS_SYNC_MS = 2000;

// ═══════════════════════════════════════════════════════════════════════════
// Assertion 1 — RESET: end trial early with carry_over_usages disabled
//
// Subscribe to a free trial, consume some allowance, then end the trial early
// via billing.update. Without carry_over_usages the usage was carried onto the
// paid cycle and never reset; with { enabled: false } the allowance resets.
//
// Pro trial: 100 messages, 40 used during trial (balance 60).
// End trial early (customize.free_trial: null) + carry_over_usages.enabled: false.
// Expected: balance = 100, usage = 0.
// ═══════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("trial->paid: end trial early with carry_over_usages disabled resets allowance")}`,
	async () => {
		const customerId = "update-cou-reset";
		const proTrial = products.proWithTrial({
			id: "pro-trial-cou-reset",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 7 }),
			],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await autumnV2_3.billing.update(
			{
				customer_id: customerId,
				plan_id: proTrial.id,
				customize: { free_trial: null },
				carry_over_usages: { enabled: false },
			},
			{ timeout: 5000 },
		);
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 100,
			usage: 0,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// Assertion 2 — DEFAULT (back-compat): no param carries usage as today
//
// Same flow, no carry_over_usages. Expected: balance = 60, usage = 40.
// This MUST stay green pre- and post-fix (guards the default).
// ═══════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("update carry_over_usages: absent param carries usage (default, back-compat)")}`,
	async () => {
		const customerId = "update-cou-default";
		const proTrial = products.proWithTrial({
			id: "pro-trial-cou-default",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 7 }),
			],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await autumnV2_3.billing.update(
			{
				customer_id: customerId,
				plan_id: proTrial.id,
				customize: { free_trial: null },
			},
			{ timeout: 5000 },
		);
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 60,
			usage: 40,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// Assertion 3 — SUBSET: feature_ids carries only listed features, resets others
//
// Trial product with two allowance features (messages 100, words 100).
// Use 40 messages and 30 words during trial.
// Convert with { enabled: true, feature_ids: [messages] }.
// Expected: messages balance = 60 (carried), words balance = 100 (reset).
// ═══════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("update carry_over_usages: feature_ids carries only listed feature, resets others")}`,
	async () => {
		const customerId = "update-cou-subset";
		const proTrial = products.proWithTrial({
			id: "pro-trial-cou-subset",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyWords({ includedUsage: 100 }),
			],
			trialDays: 14,
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 7 }),
			],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 30,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await autumnV2_3.billing.update(
			{
				customer_id: customerId,
				plan_id: proTrial.id,
				customize: { free_trial: null },
				carry_over_usages: {
					enabled: true,
					feature_ids: [TestFeature.Messages],
				},
			},
			{ timeout: 5000 },
		);
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 60,
			usage: 40,
		});
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			balance: 100,
			usage: 0,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════
// Assertion 4 — V0 wire shape (dashboard path)
//
// The dashboard sends V0-shaped params (product_id, free_trial) that the server
// maps to V1. carry_over_usages must survive the V0 parse + version mapping.
// Same flow as assertion 1 but via the V0 client.
// ═══════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("trial->paid: carry_over_usages survives the V0 param mapping")}`,
	async () => {
		const customerId = "update-cou-v0";
		const proTrial = products.proWithTrial({
			id: "pro-trial-cou-v0",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [
				s.attach({ productId: proTrial.id }),
				s.advanceTestClock({ days: 7 }),
			],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		await autumnV1.subscriptions.update(
			{
				customer_id: customerId,
				product_id: proTrial.id,
				free_trial: null,
				carry_over_usages: { enabled: false },
			},
			{ timeout: 5000 },
		);
		await new Promise((resolve) => setTimeout(resolve, REDIS_SYNC_MS));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 100,
			usage: 0,
		});
	},
);
