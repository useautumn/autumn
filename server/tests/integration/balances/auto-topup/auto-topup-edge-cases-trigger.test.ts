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
	`${chalk.yellowBright("auto-topup ec2: balance depleted to exactly 0 — triggers top-up")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const prod = products.base({
			id: "topup-ec2",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "auto-topup-ec2",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [prod] }),
			],
			actions: [
				s.attach({
					productId: prod.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 20,
				quantity: 100,
			}),
		});

		// Track exactly 100 → balance = 0 → 0 < 20 → should trigger top-up
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expect(after.balances[TestFeature.Messages].remaining).toBe(100);
	},
);

test.concurrent(
	`${chalk.yellowBright("auto-topup ec3: quantity < threshold — re-triggers on every track")}`,
	async () => {
		const oneOffItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const prod = products.base({
			id: "topup-ec3",
			items: [oneOffItem],
		});

		const { customerId, autumnV2_1 } = await initScenario({
			customerId: "auto-topup-ec3",
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

		// threshold=100, quantity=50 → after top-up, balance will still be below threshold
		await autumnV2_1.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 130,
				quantity: 50,
			}),
		});

		// Round 1: Track 170 → balance=30 → top-up fires → balance=80
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 170,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const mid = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const midBalance = mid.balances[TestFeature.Messages].remaining;
		const expectedMid = new Decimal(200).sub(170).add(100).toNumber();
		expect(midBalance).toBe(expectedMid);

		// Round 2: Track just 1 → balance=79 → still below threshold 100 → ANOTHER top-up fires
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});

		await timeout(AUTO_TOPUP_WAIT_MS);

		const after = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const afterBalance = after.balances[TestFeature.Messages].remaining;
		const expectedAfter = new Decimal(130).sub(1).add(100).toNumber();
		expect(afterBalance).toBe(expectedAfter);
	},
);
