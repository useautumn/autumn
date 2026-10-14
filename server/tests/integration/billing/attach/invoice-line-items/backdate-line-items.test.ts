import { expect, test } from "bun:test";
import { type AttachParamsV1Input, ms } from "@autumn/shared";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(
	`${chalk.yellowBright("backdate-line-items: 35-day backdate bills 2 cycles and persists matching line items")}`,
	async () => {
		const customerId = "attach-backdate-line-items";
		const basePrice = 20;
		const cycles = 2;
		const expectedTotal = basePrice * cycles;

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const startsAt = advancedTo - ms.days(35);
		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: startsAt,
		});

		expect(result.invoice?.stripe_id).toBeDefined();
		expect(result.invoice?.total).toBe(expectedTotal);

		const lineItems = await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: result.invoice!.stripe_id,
			expectedTotal,
			allCharges: true,
			expectedLineItems: [
				{
					isBasePrice: true,
					billingTiming: "in_advance",
					totalAmount: expectedTotal,
					minCount: cycles,
				},
			],
		});

		const baseLineItems = lineItems
			.filter((lineItem) => lineItem.feature_id === null)
			.sort(
				(a, b) =>
					(a.effective_period_start ?? 0) - (b.effective_period_start ?? 0),
			);

		expect(baseLineItems).toHaveLength(cycles);
		for (let index = 0; index < cycles; index++) {
			const lineItem = baseLineItems[index]!;
			expect(lineItem.description_source).toBe("stripe");
			expect(
				Math.abs(
					(lineItem.effective_period_start ?? 0) -
						addMonths(startsAt, index).getTime(),
				),
			).toBeLessThan(1000);
			expect(
				Math.abs(
					(lineItem.effective_period_end ?? 0) -
						addMonths(startsAt, index + 1).getTime(),
				),
			).toBeLessThan(1000);
		}
	},
);
