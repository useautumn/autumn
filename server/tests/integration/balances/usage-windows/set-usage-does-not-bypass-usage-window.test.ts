import { expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

const CAP = 5;

test.concurrent(
	`${chalk.yellowBright("set_usage on a feature with a usage window does not bypass the cap")}`,
	async () => {
		const customerProduct = products.base({
			id: "set-usage-guard-removal",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
			billingControls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						limit: CAP,
						interval: ResetInterval.Day,
					},
				],
			},
		});

		const customerId = "set-usage-guard-removal-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: CAP,
		});

		const checkCapExhausted = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
		});
		expect(checkCapExhausted.allowed).toBe(false);

		await autumnV2_3.usage({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 0,
		});

		const checkCapStillEnforcedAfterReset = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
		});
		expect(checkCapStillEnforcedAfterReset.allowed).toBe(false);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});

		const checkAfterOverCapTrack = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 1,
		});
		expect(checkAfterOverCapTrack.allowed).toBe(false);
	},
);
