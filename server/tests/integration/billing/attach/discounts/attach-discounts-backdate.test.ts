import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	type AttachPreviewResponse,
	ms,
} from "@autumn/shared";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { createAmountCoupon } from "../../utils/discounts/discountTestUtils";

test.concurrent(
	`${chalk.yellowBright("attach-discount backdate: amount-off coupon applies once to backdated invoice")}`,
	async () => {
		const customerId = "att-disc-backdate-amt-off";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 500,
			durationInMonths: 12,
		});
		const startsAt = advancedTo - ms.days(40);

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: startsAt,
			discounts: [{ reward_id: coupon.id }],
		};
		const preview =
			(await autumnV2_2.billing.previewAttach(params)) as AttachPreviewResponse;

		expect(preview.subtotal).toBe(40);
		expect(preview.total).toBe(35);
		expect(preview.line_items[0]?.period).toEqual({
			start: startsAt,
			end: addMonths(startsAt, 2).getTime(),
		});
		expect(preview.line_items[0]?.description).toContain("from");
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: addMonths(startsAt, 2).getTime(),
			total: 15,
		});

		const result = await autumnV2_2.billing.attach(params);
		expect(result.invoice?.total).toBe(preview.total);

		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: result.invoice!.stripe_id,
			expectedTotal: 35,
			allCharges: true,
			expectedLineItems: [
				{
					isBasePrice: true,
					billingTiming: "in_advance",
					totalAmount: 35,
					minCount: 2,
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-discount backdate: one-month coupon expires before next cycle")}`,
	async () => {
		const customerId = "att-disc-backdate-one-month";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 500,
			durationInMonths: 1,
		});
		const startsAt = advancedTo - ms.days(40);

		const preview =
			(await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				starts_at: startsAt,
				discounts: [{ reward_id: coupon.id }],
			})) as AttachPreviewResponse;

		expect(preview.subtotal).toBe(40);
		expect(preview.total).toBe(35);
		expect(preview.line_items[0]?.period).toEqual({
			start: startsAt,
			end: addMonths(startsAt, 2).getTime(),
		});
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: addMonths(startsAt, 2).getTime(),
			total: 20,
		});
	},
);
