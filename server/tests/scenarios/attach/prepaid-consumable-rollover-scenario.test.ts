import { test } from "bun:test";
import { RolloverExpiryDurationType } from "@autumn/shared";
import {
	constructArrearItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features";

/**
 * Scenario: Prepaid + Consumable messages on the same plan, both with rollovers.
 *
 * - Prepaid messages: 100 included + purchasable in packs of 100 at $10
 * - Consumable messages: 50 included + $0.10/unit overage
 * - Both have 50% max_percentage rollover, 1 month duration
 *
 * After attach + some usage + a reset cycle, inspect the dashboard
 * to see how rollovers display for this combo.
 */

test(`${chalk.yellowBright("scenario: prepaid + consumable messages with rollover")}`, async () => {
	const rolloverConfig = {
		max_percentage: 50,
		length: 1,
		duration: RolloverExpiryDurationType.Month,
	};

	const prepaidMessages = constructPrepaidItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
		rolloverConfig,
	});

	const consumableMessages = constructArrearItem({
		featureId: TestFeature.Messages,
		includedUsage: 50,
		price: 0.1,
		billingUnits: 1,
		rolloverConfig,
	});

	const pro = products.pro({
		id: "pro-combo-rollover",
		items: [prepaidMessages, consumableMessages],
	});

	await initScenario({
		customerId: "combo-rollover",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
			s.track({ featureId: TestFeature.Messages, value: 80, timeout: 2000 }),
			s.advanceToNextInvoice(),
		],
	});
});
