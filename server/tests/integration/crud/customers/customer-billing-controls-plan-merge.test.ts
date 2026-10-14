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

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		await timeout(3000);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const controls = customer.billing_controls;

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

		const wordsLimits = controls.usage_limits?.filter(
			(entry) => entry.feature_id === TestFeature.Words,
		);
		expect(wordsLimits).toHaveLength(1);
		expect(wordsLimits?.[0]).toMatchObject({
			limit: 20,
			interval: ResetInterval.Month,
			source: "customer",
		});

		expect(controls.spend_limits).toHaveLength(1);
		expect(controls.spend_limits?.[0]).toMatchObject({
			feature_id: TestFeature.Words,
			overage_limit: 10,
			source: "plan",
		});

		expect(controls.overage_allowed).toHaveLength(1);
		expect(controls.overage_allowed?.[0]).toMatchObject({
			feature_id: TestFeature.Words,
			enabled: true,
			source: "plan",
		});

		expect(controls.auto_topups).toHaveLength(1);
		expect(controls.auto_topups?.[0]).toMatchObject({
			feature_id: TestFeature.Messages,
			threshold: 20,
			quantity: 100,
			source: "plan",
		});

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
