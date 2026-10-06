import { expect, test } from "bun:test";
import type { AttachPreviewResponse } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits upgrade 2: no discount — credit reflects full price")}`,
	async () => {
		const customerId = "inv-cred-upg-full";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ toNextInvoice: true }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		})) as AttachPreviewResponse;

		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum, li) => sum + li.total, 0);
		expect(creditTotal).toBeLessThan(0);
		expect(creditTotal).toBeGreaterThan(-20);

		const result = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		expect(result.invoice?.total).toBeCloseTo(preview.total, 0);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits upgrade 5: upgrade twice in one period — second upgrade nets prior refund")}`,
	async () => {
		const customerId = "inv-cred-upg-twice";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const growth = products.growth({
			id: "growth",
			items: [items.monthlyMessages({ includedUsage: 2000 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium, growth] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ toNextInvoice: true }),
				s.advanceTestClock({ days: 10 }),
			],
		});

		const firstUpgradeResult = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		expect(firstUpgradeResult.invoice).toBeDefined();

		await new Promise((resolve) => setTimeout(resolve, 5000));

		const secondPreview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `growth_${customerId}`,
		})) as AttachPreviewResponse;

		const creditLines = secondPreview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const positiveLines = secondPreview.line_items.filter((li) => li.total > 0);
		expect(positiveLines.length).toBeGreaterThan(0);

		const secondResult = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `growth_${customerId}`,
		});

		expect(secondResult.invoice?.total).toBeCloseTo(secondPreview.total, 0);
	},
	300_000,
);
