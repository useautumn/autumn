/**
 * Paid plans with `config.anchor_to_month_start` create their Stripe subscription
 * anchored to the next 1st (00:00 UTC).
 *
 * Contract:
 *   attach monthly  → sub anchored to the 1st; first invoice prorated to the 1st and equal
 *                     to the preview total; resets on the 1st
 *   attach annual   → sub anchored to the 1st, yearly interval
 *   multi-attach    → one sub anchored to the 1st
 *   attach via Checkout → sub anchored to the 1st once checkout completes
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	MultiAttachParamsV0Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { calculateNewSubscriptionAnchorStub } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	anchoredToMonthStart,
	expectStripeSubscriptionAnchorCorrect,
	nextMonthStartMs,
} from "./utils/anchorToMonthStartUtils";

const PRO_MONTHLY_PRICE = 20;
const EXACT_MS = 1000;

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start paid 1: monthly attach anchors the subscription to the 1st")}`,
	async () => {
		const customerId = "anchor-month-paid-monthly";
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
		};
		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(attachParams);
		expect(preview.total).toBe(
			calculateNewSubscriptionAnchorStub({
				advancedTo,
				anchorMs: monthStartMs,
				amount: PRO_MONTHLY_PRICE,
			}),
		);

		await autumnV2_3.billing.attach<AttachParamsV1Input>(attachParams);

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: monthStartMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: preview.total,
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

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start paid 2: annual attach anchors the subscription to the 1st")}`,
	async () => {
		const customerId = "anchor-month-paid-annual";
		const proAnnual = anchoredToMonthStart(
			products.proAnnual({
				id: "pro-annual",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proAnnual] }),
			],
			actions: [s.billing.attach({ productId: proAnnual.id })],
		});

		const subscription = await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: nextMonthStartMs({ fromMs: advancedTo }),
		});
		expect(subscription.items.data[0]?.price.recurring?.interval).toBe("year");
		await expectCustomerInvoiceCorrect({ customerId, count: 1 });
	},
);

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start paid 3: multi-attach of flagged plans creates one subscription on the 1st")}`,
	async () => {
		const customerId = "anchor-month-paid-multi";
		const pro = anchoredToMonthStart(
			products.pro({
				id: "pro",
				group: "main",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);
		const addOn = anchoredToMonthStart(
			products.pro({
				id: "add-on",
				group: "addon",
				items: [items.monthlyWords({ includedUsage: 200 })],
			}),
		);

		const { autumnV2_3, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addOn] }),
			],
			actions: [],
		});

		const multiAttachParams: MultiAttachParamsV0Input = {
			customer_id: customerId,
			plans: [{ plan_id: pro.id }, { plan_id: addOn.id }],
		};
		await autumnV2_3.billing.multiAttach(multiAttachParams);

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: nextMonthStartMs({ fromMs: advancedTo }),
		});
	},
);

test(`${chalk.yellowBright("anchor-to-month-start paid 4: attach via Checkout anchors the subscription to the 1st")}`, async () => {
	const customerId = "anchor-month-paid-checkout";
	const pro = anchoredToMonthStart(
		products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		}),
	);

	const { autumnV2_3, advancedTo } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [pro] })],
		actions: [],
	});
	const monthStartMs = nextMonthStartMs({ fromMs: advancedTo });

	const result = await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
	});
	expect(result.payment_url).toContain("checkout.stripe.com");
	await completeStripeCheckoutFormV2({ url: result.payment_url! });

	await expectStripeSubscriptionAnchorCorrect({
		customerId,
		anchorMs: monthStartMs,
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
});
