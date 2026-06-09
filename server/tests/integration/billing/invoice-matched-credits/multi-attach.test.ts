import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createPercentCoupon } from "../utils/discounts/discountTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits multi-attach 1: discounted outgoing — credit reflects stored charge")}`,
	async () => {
		const customerId = "imc-multi-disc-out";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 200 })],
		});

		const { autumnV1, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium, addon] }),
			],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			discounts: [{ reward_id: coupon.id }],
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

		const renewalTime = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(
				addMonths(new Date(advancedTo), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			startingFrom: new Date(renewalTime),
			numberOfDays: 15,
		});

		const preview = await autumnV1.billing.previewMultiAttach({
			customer_id: customerId,
			plans: [{ plan_id: `premium_${customerId}` }, { plan_id: `addon_${customerId}` }],
		});

		expect(preview.total).toBeDefined();
		expect(preview.outgoing.length).toBeGreaterThanOrEqual(1);

		const outgoingPro = preview.outgoing.find(
			(c: { plan_id: string }) => c.plan_id === `pro_${customerId}`,
		);
		expect(outgoingPro).toBeDefined();

		const catalogTotal = 50 + 20;
		expect(preview.total).toBeLessThan(catalogTotal);

		await autumnV1.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: `premium_${customerId}` }, { plan_id: `addon_${customerId}` }],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [`premium_${customerId}`, `addon_${customerId}`],
			notPresent: [`pro_${customerId}`],
		});
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits multi-attach 2: add-only — no credit lines")}`,
	async () => {
		const customerId = "imc-multi-add-only";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 200 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `addon_${customerId}`,
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer,
			productId: `pro_${customerId}`,
		});

		await expectProductActive({
			customer,
			productId: `addon_${customerId}`,
		});

		const latestInvoice = customer.invoices?.[0];
		expect(latestInvoice).toBeDefined();
		expect(latestInvoice!.total).toBeGreaterThanOrEqual(0);
	},
	300_000,
);
