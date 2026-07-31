/**
 * Identical multi-attach checkout requests reuse the reserved Stripe session.
 */

import { expect, test } from "bun:test";
import type { MultiAttachParamsV0Input } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("multi-attach checkout lock: identical requests return the cached URL")}`,
	async () => {
		const customerId = "multi-attach-checkout-lock";
		const core = products.base({
			id: "core",
			group: "core",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const data = products.base({
			id: "data",
			group: "data",
			items: [items.monthlyPrice({ price: 30 })],
		});
		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [core, data] }),
			],
			actions: [],
		});
		const params: MultiAttachParamsV0Input = {
			customer_id: customerId,
			plans: [{ plan_id: core.id }, { plan_id: data.id }],
		};

		const first = await autumnV2_2.billing.multiAttach(params, { timeout: 0 });
		const second = await autumnV2_2.billing.multiAttach(params, { timeout: 0 });

		expect(first.payment_url).toContain("checkout.stripe.com");
		expect(second.payment_url).toBe(first.payment_url);
	},
);
