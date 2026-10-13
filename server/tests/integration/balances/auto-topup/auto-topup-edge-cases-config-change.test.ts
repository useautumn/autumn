import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { AUTO_TOPUP_WAIT_MS } from "./utils/autoTopupEdgeCases";

test.concurrent(
	`${chalk.yellowBright("auto-topup ec1: disabling config prevents subsequent top-ups")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const prod = products.base({
			id: "topup-ec1",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "auto-topup-ec1",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [prod] }),
			],
			actions: [
				s.attach({
					productId: prod.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 30,
				quantity: 100,
			}),
		});

		// Round 1: Track 180 → balance=20 → top-up fires → balance=120
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 180,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const midBalance = mid.balances[TestFeature.Messages].remaining;
		const expectedMid = new Decimal(200).sub(180).add(100).toNumber();
		expect(midBalance).toBe(expectedMid);

		// Disable auto top-up between rounds
		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({ enabled: false }),
		});

		// Round 2: Track 100 → balance=20 → below threshold, but config is disabled → no top-up
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(after.balances[TestFeature.Messages].remaining).toBe(20);
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup ec5: lowered threshold respected on next trigger")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const prod = products.base({
			id: "topup-ec5",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "auto-topup-ec5",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [prod] }),
			],
			actions: [
				s.attach({
					productId: prod.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		// Start with threshold=50
		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 50,
				quantity: 100,
			}),
		});

		// Round 1: Track 160 → balance=40 → 40 < 50 → top-up fires → balance=140
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 160,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const midBalance = mid.balances[TestFeature.Messages].remaining;
		const expectedMid = new Decimal(200).sub(160).add(100).toNumber();
		expect(midBalance).toBe(expectedMid);

		// Lower threshold to 10 between rounds
		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 10,
				quantity: 100,
			}),
		});

		// Round 2: Track 105 → balance=35 → above new threshold (10) → no top-up
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 105,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(after.balances[TestFeature.Messages].remaining).toBe(35);
	},
);
