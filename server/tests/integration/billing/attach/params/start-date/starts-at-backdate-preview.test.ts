import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	type AttachPreviewResponse,
	ms,
} from "@autumn/shared";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { expectResetAnchoredTo } from "./utils";
import { expectAttachBackdateCorrect } from "./utils/expectAttachBackdateCorrect";

test.concurrent(
	`${chalk.yellowBright("starts_at backdate preview: single elapsed cycle bills one period, renews next month")}`,
	async () => {
		const customerId = "attach-backdate-preview-one-cycle";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const startsAt = advancedTo - ms.days(10);

		const preview =
			(await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				starts_at: startsAt,
			})) as AttachPreviewResponse;

		expect(preview.total).toBe(20);
		expect(preview.subtotal).toBe(20);
		expect(
			preview.line_items.reduce((sum, lineItem) => sum + lineItem.total, 0),
		).toBe(preview.total);

		expectPreviewNextCycleCorrect({
			preview,
			startsAt: addMonths(startsAt, 1).getTime(),
			total: 20,
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: startsAt,
		});

		expect(result.invoice?.total).toBe(preview.total);

		const cusProduct = await expectAttachBackdateCorrect({
			autumn: autumnV1,
			ctx,
			customerId,
			productId: pro.id,
			startsAt,
			result,
			minInvoiceTotal: 1900,
			minInvoiceLineCount: 1,
		});

		expectResetAnchoredTo({
			cusProduct,
			featureId: TestFeature.Messages,
			startDate: startsAt,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("starts_at backdate preview: two elapsed cycles bill two periods, renews two months out")}`,
	async () => {
		const customerId = "attach-backdate-preview-two-cycles";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const startsAt = advancedTo - ms.days(40);

		const preview =
			(await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				starts_at: startsAt,
			})) as AttachPreviewResponse;

		expect(preview.total).toBe(40);
		expect(preview.subtotal).toBe(40);
		expect(
			preview.line_items.reduce((sum, lineItem) => sum + lineItem.total, 0),
		).toBe(preview.total);

		expectPreviewNextCycleCorrect({
			preview,
			startsAt: addMonths(startsAt, 2).getTime(),
			total: 20,
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: startsAt,
		});

		expect(result.invoice?.total).toBe(preview.total);

		const cusProduct = await expectAttachBackdateCorrect({
			autumn: autumnV1,
			ctx,
			customerId,
			productId: pro.id,
			startsAt,
			result,
			minInvoiceTotal: 3900,
			minInvoiceLineCount: 2,
		});

		expectResetAnchoredTo({
			cusProduct,
			featureId: TestFeature.Messages,
			startDate: addMonths(startsAt, 1).getTime(),
		});
	},
);
