// Red: usage-based rollovers expired from wall-clock time.
// Green: prepaid and usage-based one-month rollovers expire at next_reset_at.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type RolloverConfig,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	constructArrearItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { expectBalanceCorrect } from "../../../utils/expectBalanceCorrect.js";

const rolloverConfig: RolloverConfig = {
	max: null,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

const expectOneMonthRolloverExpiresAtNextReset = ({
	customer,
}: {
	customer: ApiCustomerV5;
}) => {
	const balance = customer.balances[TestFeature.Messages];
	expect(balance).toBeDefined();
	expect(balance.next_reset_at).not.toBeNull();
	expect(balance.rollovers?.length ?? 0).toBeGreaterThan(0);

	const nextResetAt = balance.next_reset_at!;
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		nextResetAt,
		positiveRolloverCount: 1,
	});

	const positiveRollovers = balance.rollovers!.filter(
		(item) => item.balance > 0,
	);
	const rollover = positiveRollovers[0];
	const expectedExpiry = nextResetAt;
	const actualExpiry = rollover.expires_at;
	const diff = Math.abs(actualExpiry - expectedExpiry);

	expect(
		diff,
		`Expected rollover to expire at ${new Date(expectedExpiry).toISOString()}, got ${new Date(actualExpiry).toISOString()}`,
	).toBeLessThanOrEqual(10 * 60 * 1000);
};

test.concurrent(
	`${chalk.yellowBright("invoice.created rollover expiry: prepaid uses next reset boundary")}`,
	async () => {
		const prepaidItem = constructPrepaidItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			billingUnits: 100,
			price: 10,
			rolloverConfig,
		});
		const pro = products.pro({
			id: "pro-prepaid-rollover-expiry",
			items: [prepaidItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "invoice-created-prepaid-rollover-expiry",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
				s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const after = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectOneMonthRolloverExpiresAtNextReset({ customer: after });
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice.created rollover expiry: usage-based uses next reset boundary")}`,
	async () => {
		const consumableItem = constructArrearItem({
			featureId: TestFeature.Messages,
			includedUsage: 200,
			price: 0.1,
			billingUnits: 1,
			rolloverConfig,
		});
		const pro = products.pro({
			id: "pro-consumable-rollover-expiry",
			items: [consumableItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "invoice-created-consumable-rollover-expiry",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 50, timeout: 2000 }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const after = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectOneMonthRolloverExpiresAtNextReset({ customer: after });
	},
);
