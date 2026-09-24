/**
 * invoices.create — the PRD's headline request, end to end, with every amount
 * worked out by hand.
 *
 * Catalog:
 *   pro           $20 / month base
 *     users       $10 per seat, prepaid
 *     credits     $0.01 per credit (Action1 = 0.2 credits, Action2 = 0.6)
 *     messages    $0.10 per message, usage-based
 *   editor        license linked to pro, $25 / seat in the catalog
 *     words       $0.05 per word, usage-based
 *   pro-annual    $200 / year base
 *
 * Request                                    Line
 *   pro base                                 $20.00
 *   5 seats × $10                            $50.00
 *   10000 Action1 × 0.2 + 2000 Action2 × 0.6
 *     = 3200 credits × $0.01                 $32.00
 *   2500 messages × $0.10                    $250.00
 *   3 editor seats × $15 (customized)        $45.00
 *   100 words × $0.05 (through the license)  $5.00
 *   pro-annual base                          $200.00
 *   Implementation services (custom)         $500.00
 *                                            ────────
 *   subtotal                                 $1102.00
 *   −10% on pro's lines only (402 → 361.80)  −$40.20
 *   −10% promotion code on the invoice       −$106.18
 *                                            ────────
 *   total                                    $955.62
 */

import { expect, test } from "bun:test";
import { BillingInterval, BillingMethod, RewardType } from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructCoupon } from "@/utils/scriptUtils/createTestProducts";
import {
	createInvoice,
	expectCreatedInvoiceCorrect,
} from "./utils/expectCreatedInvoiceCorrect";

test(`${chalk.yellowBright("invoices.create: two plans, prepaid, usage, credits, licenses, discounts and a custom charge")}`, async () => {
	const customerId = "inv-create-happy";
	const promoCode = `INVCREATEHAPPY${Date.now()}`;

	const pro = products.pro({
		id: "pro-happy",
		items: [
			items.prepaidUsers(),
			items.consumable({ featureId: TestFeature.Credits, price: 0.01 }),
			items.consumableMessages(),
		],
	});
	const editor = products.base({
		id: "editor-happy",
		items: [items.monthlyPrice({ price: 25 }), items.consumableWords()],
	});
	const annual = products.proAnnual({ id: "support-yearly-happy", items: [] });

	const invoicePromo = constructCoupon({
		id: "inv-create-happy-promo",
		promoCode,
		discountType: RewardType.PercentageDiscount,
		discountValue: 10,
	});

	const { ctx, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, editor, annual] }),
			s.reward({ reward: invoicePromo, productId: pro.id }),
		],
		actions: [
			s.licenses.link({
				parentProductId: pro.id,
				licenseProductId: editor.id,
				included: 0,
			}),
		],
	});
	const planCoupon = await createPercentCoupon({
		stripeCli: ctx.stripeCli,
		percentOff: 10,
		duration: "once",
	});

	const response = await createInvoice({
		autumnV2_3,
		params: {
			customer_id: customerId,
			net_terms_days: 30,
			plans: [
				{
					plan_id: pro.id,
					feature_quantities: [
						{
							feature_id: TestFeature.Users,
							billing_behavior: BillingMethod.Prepaid,
							quantity: 5,
						},
						{
							feature_id: TestFeature.Credits,
							billing_behavior: BillingMethod.UsageBased,
							usage: [
								{ feature_id: TestFeature.Action1, quantity: 10_000 },
								{ feature_id: TestFeature.Action2, quantity: 2_000 },
							],
						},
						{
							feature_id: TestFeature.Messages,
							billing_behavior: BillingMethod.UsageBased,
							quantity: 2_500,
						},
					],
					license_quantities: [
						{
							license_plan_id: editor.id,
							quantity: 3,
							customize: {
								price: { amount: 15, interval: BillingInterval.Month },
							},
							feature_quantities: [
								{
									feature_id: TestFeature.Words,
									billing_behavior: BillingMethod.UsageBased,
									quantity: 100,
								},
							],
						},
					],
					discounts: [{ reward_id: planCoupon.id }],
				},
				{ plan_id: annual.id },
			],
			discounts: [{ promotion_code: promoCode }],
			custom_line_items: [
				{ description: "Implementation services", amount: 500 },
			],
		},
	});

	const { invoice } = await expectCreatedInvoiceCorrect({
		ctx,
		response,
		lines: [
			{
				description: `${pro.name} - Base Price`,
				amount: 20,
				quantity: null,
			},
			{ amount: 50, quantity: 5 },
			{ amount: 32, quantity: 3_200 },
			{ amount: 250, quantity: 2_500 },
			{
				description: `${editor.name} - 3x Base Price`,
				amount: 45,
				quantity: 3,
			},
			{ amount: 5, quantity: 100 },
			{
				description: `${annual.name} - Base Price`,
				amount: 200,
				quantity: null,
			},
			{ description: "Implementation services", amount: 500 },
		],
		total: 955.62,
		dueInDays: 30,
		stripeDiscountTotal: 40.2 + 106.18,
	});

	expect(response.preview.subtotal).toBeCloseTo(1102, 2);
	expect(response.preview.discount_total).toBeCloseTo(40.2 + 106.18, 2);
	expect(invoice.plan_ids.sort()).toEqual(
		[pro.id, editor.id, annual.id].sort(),
	);
});
