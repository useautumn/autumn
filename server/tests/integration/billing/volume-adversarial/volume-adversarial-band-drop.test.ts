/**
 * A band drop: crossing into a cheaper band lowers the bill as usage rises. With 5 included
 * and net tiers 0-5 @ $1 / 6+ @ $0.90, 10 used is $10.00 and 11 used is $9.90. The shown
 * balance and every preview total stay non-negative, mid-cycle and at a switch.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	advanceMidCycle,
	expectVolumeRenewalCorrect,
	getInvoicePreview,
	listStripeInvoiceLines,
	sumFeatureSubtotal,
	type VolumeScenario,
} from "./utils/volumeAdversarialUtils";

const INCLUDED = 5;
const USAGE = 11;
// 11 used lands in band 11+: 11 × $0.90 = $9.90 (10 used would be 10 × $1 = $10)
const BAND_DROP_AMOUNT = 9.9;

const bandDropItem = () =>
	items.volumeConsumableMessages({
		includedUsage: INCLUDED,
		tiers: [
			{ to: 5, amount: 1 },
			{ to: "inf", amount: 0.9 },
		],
	});

const toCents = (amount: number) => Math.round(amount * 100);

const trackMessages = async ({
	scenario,
	value,
}: {
	scenario: VolumeScenario;
	value: number;
}) => {
	await scenario.autumnV2_2.track({
		customer_id: scenario.customerId,
		feature_id: TestFeature.Messages,
		value,
	});
	await timeout(3000);
};

const expectPreviewNonNegative = async ({
	scenario,
	expectedFeatureAmount,
	usage,
}: {
	scenario: VolumeScenario;
	expectedFeatureAmount: number;
	usage: number;
}) => {
	const preview = await getInvoicePreview({ scenario });
	expect(
		sumFeatureSubtotal({
			lineItems: preview.line_items,
			featureId: TestFeature.Messages,
		}),
	).toBeCloseTo(expectedFeatureAmount, 2);
	expect(preview.total).toBeGreaterThanOrEqual(0);
	await expectBalanceCorrect({
		customerId: scenario.customerId,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage,
	});
};

/** Asserts a switch invoice equals its preview, line by line, and bills the band-drop usage. */
const expectSwitchInvoiceMatchesPreview = async ({
	scenario,
	preview,
	stripeInvoiceId,
}: {
	scenario: VolumeScenario;
	preview: { total: number; line_items: { subtotal: number }[] };
	stripeInvoiceId: string;
}) => {
	const stripeInvoice =
		await scenario.ctx.stripeCli.invoices.retrieve(stripeInvoiceId);
	expect(stripeInvoice.total).toBe(toCents(preview.total));

	const stripeLines = await listStripeInvoiceLines({
		stripeCli: scenario.ctx.stripeCli,
		invoiceId: stripeInvoiceId,
	});
	const stripeLineCents = stripeLines
		.map((line) => line.amount)
		.filter((amount) => amount !== 0)
		.sort((a, b) => a - b);
	const previewLineCents = preview.line_items
		.map((lineItem) => toCents(lineItem.subtotal))
		.filter((amount) => amount !== 0)
		.sort((a, b) => a - b);
	expect(stripeLineCents).toEqual(previewLineCents);
	expect(stripeLineCents).toContain(toCents(BAND_DROP_AMOUNT));
};

const previewUsageSubtotal = (preview: {
	line_items: { feature_id: string | null; subtotal: number }[];
}) =>
	preview.line_items
		.filter((lineItem) => lineItem.feature_id === TestFeature.Messages)
		.reduce((sum, lineItem) => sum + lineItem.subtotal, 0);

test.concurrent(
	`${chalk.yellowBright("volume-band-drop 1: 10 → 11 used drops $10.00 → $9.90; mid-cycle previews and balance stay non-negative; renewal = preview")}`,
	async () => {
		const customerId = "vol-adv-band-drop-renewal";
		const pro = products.pro({ id: customerId, items: [bandDropItem()] });
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 10,
					timeout: 3000,
				}),
			],
		});

		// 10 used lands in band 6-10: 10 × $1 = $10
		await expectPreviewNonNegative({
			scenario,
			expectedFeatureAmount: 10,
			usage: 10,
		});

		await trackMessages({ scenario, value: 1 });
		await expectPreviewNonNegative({
			scenario,
			expectedFeatureAmount: BAND_DROP_AMOUNT,
			usage: USAGE,
		});

		await advanceMidCycle({ scenario });
		await expectPreviewNonNegative({
			scenario,
			expectedFeatureAmount: BAND_DROP_AMOUNT,
			usage: USAGE,
		});

		const { renewalInvoice } = await expectVolumeRenewalCorrect({
			scenario,
			expectedFeatureAmount: BAND_DROP_AMOUNT,
		});
		// $20 base + $9.90 usage
		expect(renewalInvoice.total).toBeCloseTo(29.9, 2);
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-band-drop 2: attach preview bills 11 used at $9.90 at the switch; preview = Stripe invoice")}`,
	async () => {
		const customerId = "vol-adv-band-drop-attach";
		const pro = products.pro({
			id: `${customerId}-pro`,
			items: [bandDropItem()],
		});
		const premium = products.premium({
			id: `${customerId}-premium`,
			items: [items.volumeConsumableMessages({ includedUsage: 500 })],
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: USAGE,
					timeout: 3000,
				}),
			],
		});
		const advancedTo = await advanceMidCycle({ scenario });

		const preview = await scenario.autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(previewUsageSubtotal(preview)).toBeCloseTo(BAND_DROP_AMOUNT, 2);
		expect(preview.total).toBeGreaterThanOrEqual(0);

		// Prorated $20 → $50 base for the rest of the cycle + $9.90 usage, not prorated
		const proratedBaseDiff = await calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: 20,
			newAmount: 50,
		});
		expect(preview.total).toBeCloseTo(proratedBaseDiff + BAND_DROP_AMOUNT, 0);

		const result = await scenario.autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});
		await expectSwitchInvoiceMatchesPreview({
			scenario,
			preview,
			stripeInvoiceId: result.invoice.stripe_id,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 500,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-band-drop 3: update raising included to 10 mid-cycle bills $0 at the switch; renewal re-bands 11 used at $1: $11")}`,
	async () => {
		const customerId = "vol-adv-band-drop-update";
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: customerId,
			items: [bandDropItem(), priceItem],
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: USAGE,
					timeout: 3000,
				}),
			],
		});
		await advanceMidCycle({ scenario });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [
				items.volumeConsumableMessages({
					includedUsage: 10,
					tiers: [
						{ to: 5, amount: 1 },
						{ to: "inf", amount: 0.9 },
					],
				}),
				priceItem,
			],
		};
		// Same-plan updates don't bill consumable overage at the switch, so nothing is due
		const preview =
			await scenario.autumnV1.subscriptions.previewUpdate(updateParams);
		expect(preview.total).toBe(0);
		expect(previewUsageSubtotal(preview)).toBe(0);

		await scenario.autumnV1.subscriptions.update(updateParams);
		const customer =
			await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.invoices?.[0]?.total ?? 0).toBe(0);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: USAGE,
		});

		// 10 included: bands 11-15 @ $1 / 16+ @ $0.90, so 11 used: 11 × $1 = $11
		await expectVolumeRenewalCorrect({ scenario, expectedFeatureAmount: 11 });
	},
);
