/**
 * TDD test for "usage will reset" on approval cards.
 *
 * The executor clears usage balances when the update changes plan AND
 * carry-over is off (computeRetainedCustomerEntitlementUpdates). The preview
 * never said so, so an approver could not tell that approving would wipe the
 * customer's usage — the card only showed money.
 *
 * Red-failure mode (current behavior):
 *  - preview_update omits resets_usage entirely, so the card cannot show it.
 *
 * Green-success criteria (after fix):
 *  - resets_usage is true exactly when the executor would clear balances, and
 *    false for an update that carries usage over.
 */

import { expect, test } from "bun:test";
import type { UpdateSubscriptionV1Params } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("update preview: resets_usage matches what the executor would do")}`,
	async () => {
		const customerId = "preview-resets-usage";
		const pro = products.pro({
			id: "pro-resets-usage",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const previewUpdate = (params: Record<string, unknown>) =>
			autumnV2_2.billing.previewUpdate<UpdateSubscriptionV1Params>({
				customer_id: customerId,
				plan_id: pro.id,
				customize: { price: { amount: 777, interval: "month" } },
				...params,
			} as UpdateSubscriptionV1Params) as Promise<{ resets_usage?: boolean }>;

		const resetting = await previewUpdate({
			carry_over_usages: { enabled: false },
		});
		const carryingOver = await previewUpdate({});

		expect(resetting.resets_usage).toBe(true);
		expect(carryingOver.resets_usage).toBe(false);
	},
);
