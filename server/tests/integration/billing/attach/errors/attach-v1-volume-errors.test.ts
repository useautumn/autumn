/**
 * Attach V1 has no volume-tier billing path, so a plan with a pay-per-use volume
 * price stays blocked there with a 400 pointing at billing.attach.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("attach V1 volume errors: a plan with a volume consumable returns 400")}`,
	async () => {
		const customerId = "attach-v1-volume-consumable";
		const pro = products.pro({
			id: `${customerId}-pro`,
			items: [items.volumeConsumableMessages({ includedUsage: 100 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// The test client drops the HTTP status, so call V1 attach directly.
		const response = await fetch(`${autumnV1.baseUrl}/attach`, {
			method: "POST",
			headers: autumnV1.headers,
			body: JSON.stringify({ customer_id: customerId, product_id: pro.id }),
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.message).toInclude(
			"Volume pricing is not supported on attach V1",
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotPresent({ customer, productId: pro.id });
	},
);
