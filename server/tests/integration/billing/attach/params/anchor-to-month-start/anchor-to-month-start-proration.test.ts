/**
 * `proration_behavior: "none"` on a month-start attach charges nothing until the 1st.
 *
 * Contract:
 *   preview total 0 → sub anchored to the 1st → no invoice at attach → access granted now,
 *   resets on the 1st
 */

import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	anchoredToMonthStart,
	expectStripeSubscriptionAnchorCorrect,
	nextMonthStartMs,
} from "./utils/anchorToMonthStartUtils";

const EXACT_MS = 1000;

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start proration 1: proration_behavior none charges nothing until the 1st")}`,
	async () => {
		const customerId = "anchor-month-no-proration";
		const pro = anchoredToMonthStart(
			products.pro({
				id: "pro",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { autumnV2_3, autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});
		const monthStartMs = nextMonthStartMs({ fromMs: advancedTo });

		const attachParams: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			proration_behavior: "none",
		};
		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(attachParams);
		expect(preview.total).toBe(0);

		await autumnV2_3.billing.attach<AttachParamsV1Input>(attachParams);

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: monthStartMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 0,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			remaining: 100,
			planId: pro.id,
			nextResetAt: monthStartMs,
			toleranceMs: EXACT_MS,
		});
	},
);
