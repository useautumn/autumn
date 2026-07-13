/**
 * TDD test for plan-inherited billing controls on the customer response
 * (Resend: read the daily usage limit configured at the plan level).
 *
 * Contract under test (x-api-version >= 2.3.0):
 *   New fields:
 *     - billing_controls.<all 5 keys>[].source: "customer" | "plan" (response-only)
 *   New behaviors (customers.get):
 *     - billing_controls merges plan-level controls from active plans:
 *       usage_limits / spend_limits / overage_allowed / auto_topups /
 *       usage_alerts. Customer-level entry shadows the plan entry for the
 *       same identity (usage_limits: feature_id + filter; usage_alerts: all
 *       of a feature's customer alerts shadow all of that feature's plan
 *       alerts; others: feature_id).
 *     - Inherited usage_limits entries carry current-window `usage`.
 *     - Percentage spend limits are returned as configured (not resolved).
 *   Version gating:
 *     - x-api-version <= 2.2.0: response unchanged (customer-level entries
 *       only, no `source` field).
 *   Side effects: none (read-only).
 *
 * Pre-impl red: plan-level entries are absent from billing_controls and no
 * entry has `source` (getApiCustomerV2 reads only customer-level columns).
 * Post-impl green: response merge in getApiCustomerV2 + V2_3 version change.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });
const autumnV2_2Client = new AutumnInt({ version: ApiVersion.V2_2 });

test.concurrent(
	`${chalk.yellowBright("billing-controls-plan-merge: customers.get merges plan-level controls with source tags; older versions unchanged")}`,
	async () => {
		const customerId = "billing-controls-plan-merge-1";
		const prod = products.base({
			id: "bc-plan-merge",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyWords({ includedUsage: 50 }),
			],
			billingControls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						limit: 5,
						interval: ResetInterval.Day,
					},
					{
						feature_id: TestFeature.Words,
						enabled: true,
						limit: 50,
						interval: ResetInterval.Month,
					},
				],
				spend_limits: [
					{
						feature_id: TestFeature.Words,
						enabled: true,
						overage_limit: 10,
					},
				],
				overage_allowed: [{ feature_id: TestFeature.Words, enabled: true }],
				auto_topups: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						threshold: 20,
						quantity: 100,
					},
				],
				usage_alerts: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						threshold: 80,
						threshold_type: "usage_percentage",
					},
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						threshold: 100,
						threshold_type: "usage_percentage",
					},
					{
						feature_id: TestFeature.Words,
						enabled: true,
						threshold: 90,
						threshold_type: "usage_percentage",
					},
				],
			},
		});

		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
			actions: [s.billing.attach({ productId: prod.id })],
		});

		// Customer-level overrides: Words usage_limit shadows the plan's Words
		// entry; Words alert shadows the plan's Words alerts.
		await autumnV2_3.customers.update(customerId, {
			billing_controls: {
				usage_limits: [
					{
						feature_id: TestFeature.Words,
						enabled: true,
						limit: 20,
						interval: ResetInterval.Month,
					},
				],
				usage_alerts: [
					{
						feature_id: TestFeature.Words,
						enabled: true,
						threshold: 50,
						threshold_type: "usage_percentage",
					},
				],
			},
		});
		await timeout(3000);

		// Consume against the plan-level Messages daily cap so the inherited
		// entry's window `usage` is observable.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		await timeout(3000);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const controls = customer.billing_controls;

		// ── usage_limits: plan-inherited Messages daily cap, with usage ────
		const messagesLimit = controls.usage_limits?.find(
			(entry) => entry.feature_id === TestFeature.Messages,
		);
		expect(messagesLimit).toMatchObject({
			feature_id: TestFeature.Messages,
			enabled: true,
			limit: 5,
			interval: ResetInterval.Day,
			source: "plan",
		});
		expect(messagesLimit?.usage).toBe(3);

		// ── usage_limits: customer-level Words entry shadows the plan's ────
		const wordsLimits = controls.usage_limits?.filter(
			(entry) => entry.feature_id === TestFeature.Words,
		);
		expect(wordsLimits).toHaveLength(1);
		expect(wordsLimits?.[0]).toMatchObject({
			limit: 20,
			interval: ResetInterval.Month,
			source: "customer",
		});

		// ── spend_limits: plan-inherited ───────────────────────────────────
		expect(controls.spend_limits).toHaveLength(1);
		expect(controls.spend_limits?.[0]).toMatchObject({
			feature_id: TestFeature.Words,
			overage_limit: 10,
			source: "plan",
		});

		// ── overage_allowed: plan-inherited ────────────────────────────────
		expect(controls.overage_allowed).toHaveLength(1);
		expect(controls.overage_allowed?.[0]).toMatchObject({
			feature_id: TestFeature.Words,
			enabled: true,
			source: "plan",
		});

		// ── auto_topups: plan-inherited ────────────────────────────────────
		expect(controls.auto_topups).toHaveLength(1);
		expect(controls.auto_topups?.[0]).toMatchObject({
			feature_id: TestFeature.Messages,
			threshold: 20,
			quantity: 100,
			source: "plan",
		});

		// ── usage_alerts: customer's Words alert shadows the plan's; the
		// plan's Messages alerts are inherited ─────────────────────────────
		const wordsAlerts = controls.usage_alerts?.filter(
			(entry) => entry.feature_id === TestFeature.Words,
		);
		expect(wordsAlerts).toHaveLength(1);
		expect(wordsAlerts?.[0]).toMatchObject({
			threshold: 50,
			source: "customer",
		});

		const messagesAlerts = controls.usage_alerts?.filter(
			(entry) => entry.feature_id === TestFeature.Messages,
		);
		expect(messagesAlerts?.map((entry) => entry.threshold).sort()).toEqual(
			[100, 80].sort(),
		);
		for (const alert of messagesAlerts ?? []) {
			expect(alert.source).toBe("plan");
		}

		// ── version gating: V2_2 response is unchanged ─────────────────────
		const customerV2_2 =
			await autumnV2_2Client.customers.get<ApiCustomerV5>(customerId);
		const oldControls = customerV2_2.billing_controls;

		expect(oldControls.usage_limits?.map((entry) => entry.feature_id)).toEqual([
			TestFeature.Words,
		]);
		expect(oldControls.usage_alerts?.map((entry) => entry.feature_id)).toEqual([
			TestFeature.Words,
		]);
		expect(oldControls.spend_limits ?? []).toHaveLength(0);
		expect(oldControls.overage_allowed ?? []).toHaveLength(0);
		expect(oldControls.auto_topups ?? []).toHaveLength(0);
		for (const entry of [
			...(oldControls.usage_limits ?? []),
			...(oldControls.usage_alerts ?? []),
		]) {
			expect("source" in entry).toBe(false);
		}
	},
);
