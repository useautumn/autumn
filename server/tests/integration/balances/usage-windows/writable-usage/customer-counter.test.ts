/**
 * Writable usage-limit counters — customer scope.
 *
 * Contract:
 *   { feature_id, usage } writes the active window's counter and nothing else:
 *     - the cap keeps its limit/interval, a plan cap stays plan-sourced
 *     - check enforces against the written counter immediately
 *     - the existing window row is updated in place (no second window)
 *   A config entry without `usage` leaves the counter untouched.
 *   { feature_id, limit, interval, usage } replaces config AND sets the counter.
 *   A counter-only list never replaces the customer's config list; an explicit
 *   config list still does.
 */

import { expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerUsageLimit,
	expectCustomerUsageLimitAbsent,
	setCustomerUsageLimit,
} from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import { expectUsageWindowSynced } from "../../utils/usage-limit-utils/usageWindowDbTestUtils.js";

const autumn = new AutumnInt({ version: ApiVersion.V2_3 });

const setUsage = ({
	customerId,
	featureId,
	usage,
}: {
	customerId: string;
	featureId: string;
	usage: number;
}) =>
	autumn.customers.updateRpc(customerId, {
		billing_controls: { usage_limits: [{ feature_id: featureId, usage }] },
	});

test.concurrent(
	`${chalk.yellowBright("writable-usage-customer1: plan cap counter is written in place and enforced")}`,
	async () => {
		const product = products.base({
			id: "wu-cus-plan",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			billingControls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						limit: 5,
						interval: ResetInterval.Day,
					},
				],
			},
		});
		const { customerId, ctx } = await initScenario({
			customerId: "wu-cus-plan-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.billing.attach({ productId: product.id })],
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		await setUsage({ customerId, featureId: TestFeature.Messages, usage: 9 });
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			usage: 9,
			limit: 5,
			source: "plan",
			skipCache: true,
		});
		const overCap = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
		});
		expect(overCap.allowed).toBe(false);

		await setUsage({ customerId, featureId: TestFeature.Messages, usage: 0 });
		const afterReset = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 5,
		});
		expect(afterReset.allowed).toBe(true);
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			usage: 0,
			limit: 5,
			source: "plan",
			skipCache: true,
		});
		await expectUsageWindowSynced({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			usage: 0,
			rowCount: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("writable-usage-customer2: config-only keeps the counter, config+usage sets both")}`,
	async () => {
		const product = products.base({
			id: "wu-cus-config",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId } = await initScenario({
			customerId: "wu-cus-config-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.billing.attach({ productId: product.id })],
		});

		await setCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
			interval: ResetInterval.Day,
		});
		await setUsage({ customerId, featureId: TestFeature.Messages, usage: 4 });
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			usage: 4,
			limit: 5,
			source: "customer",
			skipCache: true,
		});

		await autumn.customers.updateRpc(customerId, {
			billing_controls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						limit: 8,
						interval: ResetInterval.Day,
					},
				],
			},
		});
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			usage: 4,
			limit: 8,
			skipCache: true,
		});

		await autumn.customers.updateRpc(customerId, {
			billing_controls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						limit: 10,
						interval: ResetInterval.Day,
						usage: 1,
					},
				],
			},
		});
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			usage: 1,
			limit: 10,
			skipCache: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("writable-usage-customer3: a counter-only list never replaces the config list")}`,
	async () => {
		const product = products.base({
			id: "wu-cus-list",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyWords({ includedUsage: 100 }),
			],
		});
		const { customerId } = await initScenario({
			customerId: "wu-cus-list-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.billing.attach({ productId: product.id })],
		});

		await autumn.customers.updateRpc(customerId, {
			billing_controls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						limit: 5,
						interval: ResetInterval.Day,
					},
					{
						feature_id: TestFeature.Words,
						limit: 7,
						interval: ResetInterval.Day,
					},
				],
			},
		});

		await setUsage({ customerId, featureId: TestFeature.Messages, usage: 2 });
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			usage: 2,
			limit: 5,
			skipCache: true,
		});
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Words,
			limit: 7,
			skipCache: true,
		});

		await autumn.customers.updateRpc(customerId, {
			billing_controls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						limit: 5,
						interval: ResetInterval.Day,
					},
				],
			},
		});
		await expectCustomerUsageLimitAbsent({
			autumn,
			customerId,
			featureId: TestFeature.Words,
		});
	},
);
