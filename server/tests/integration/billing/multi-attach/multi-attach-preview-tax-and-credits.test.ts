/** Multi-attach previews include automatic tax and available invoice credits. */

import { expect, test } from "bun:test";
import type {
	AttachPreviewResponse,
	MultiAttachParamsV0Input,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const auAddress = {
	country: "AU" as const,
	line1: "1 Test St",
	city: "Sydney",
	postal_code: "2000",
	state: "NSW",
};

test.concurrent(
	`${chalk.yellowBright("multi-attach preview: includes tax and invoice credits")}`,
	async () => {
		const customerId = "multi-attach-preview-tax-credits";
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
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { address: auAddress, balance: -1_000 },
				}),
				s.products({ list: [core, data] }),
			],
			actions: [],
		});

		const params: MultiAttachParamsV0Input = {
			customer_id: customerId,
			plans: [{ plan_id: core.id }, { plan_id: data.id }],
		};
		const preview = (await autumnV2_2.billing.previewMultiAttach(
			params,
		)) as AttachPreviewResponse;

		expect(preview.subtotal).toBe(50);
		expect(preview.tax?.status).toBe("complete");
		expect(preview.tax?.total).toBeGreaterThan(0);
		expect(preview.invoice_credits).toMatchObject({
			balance: 10,
			currency: preview.currency,
		});
		expect(preview.total).toBeCloseTo(
			preview.subtotal + (preview.tax?.total ?? 0) - 10,
			2,
		);
	},
	300_000,
);
