/**
 * dfu.flash — a free-plan customer (never created in any processor) imports with
 * no top-level `processors` and no `billable.processor`.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5 } from "@autumn/shared";
import {
	type FlashClient,
	callFlash,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: free-plan customer imports with no processors and no billable processor")}`,
	async () => {
		const customerId = "dfu-flash-free-plan";
		const free = products.pro({
			id: "dfu-free-plan",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			customer_data: { email: `${customerId}@example.com` },
			// No `processors` and no `billable.processor` — the customer was only
			// ever on a free plan, so it exists in no processor.
			billables: [
				{
					plan: {
						plan_id: free.id,
						status: "active",
						started_at: Date.now() - 1000 * 60 * 60 * 24 * 30,
						balances: [{ feature_id: TestFeature.Messages, usage: 10 }],
					},
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);
		expect(flashRes.errorCode).not.toBe("invalid_inputs");
		expect(flashRes.errorCode).not.toBe("invalid_request");
		const flashed = flashRes.result?.flashed?.find((f) => f.plan_id === free.id);
		expect(flashed?.customer_product_id).toBeTruthy();
		expect(flashed?.status).toBe("active");

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [free.id] });
	},
);
