/**
 * The upcoming-invoice preview follows invoice.created's trial rule: the invoice opening the
 * first paid period bills no trial usage, while a normal renewal still bills the cycle's usage.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	CustomerExpand,
	ms,
} from "@autumn/shared";
import { expectInvoicePreviewMatchesStripeInvoice } from "@tests/integration/billing/utils/expectInvoicePreviewMatchesStripeInvoice";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceClockForInvoice } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const TRIAL_DAYS = 7;
const BASE_PRICE = 20;
// 600 over the 100 included spans both graduated tiers (500 @ $0.10, then $0.05).
const MESSAGES_TRACKED = 700;

const setupTieredConsumable = ({
	customerId,
	trialDays,
}: {
	customerId: string;
	trialDays?: number;
}) => {
	const tieredMessages = items.tieredConsumableMessages({ includedUsage: 100 });
	const pro = trialDays
		? products.proWithTrial({
				id: `${customerId}-pro`,
				items: [tieredMessages],
				trialDays,
			})
		: products.pro({ id: `${customerId}-pro`, items: [tieredMessages] });

	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({
				featureId: TestFeature.Messages,
				value: MESSAGES_TRACKED,
				timeout: 2000,
			}),
		],
	});
};

const getInvoicePreview = async ({
	autumnV2_2,
	customerId,
}: {
	autumnV2_2: AutumnInt;
	customerId: string;
}) => {
	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		expand: [CustomerExpand.InvoicePreviews],
	});
	expect(customer.invoice_previews).toHaveLength(1);
	return customer.invoice_previews![0];
};

/** Advances past the next invoice and returns the Stripe id of the invoice it issued. */
const advanceToIssuedInvoice = async ({
	stripeCli,
	autumnV1,
	customerId,
	testClockId,
	advancedTo,
	numberOfDays,
}: {
	stripeCli: Stripe;
	autumnV1: AutumnInt;
	customerId: string;
	testClockId: string;
	advancedTo: number;
	numberOfDays?: number;
}) => {
	const before = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await advanceClockForInvoice({
		stripeCli,
		testClockId,
		startingFrom: new Date(advancedTo),
		numberOfDays,
	});
	const after = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(after.invoices).toHaveLength((before.invoices?.length ?? 0) + 1);
	return after.invoices![0].stripe_id;
};

test.concurrent(
	`${chalk.yellowBright("invoice-previews trial: trial-end preview bills no trial usage, as the invoice")}`,
	async () => {
		const customerId = "invoice-previews-trial-usage";
		const { ctx, autumnV1, autumnV2_2, testClockId, advancedTo } =
			await setupTieredConsumable({ customerId, trialDays: TRIAL_DAYS });

		const preview = await getInvoicePreview({ autumnV2_2, customerId });
		expect(preview.invoice_at).toBeCloseTo(
			advancedTo + ms.days(TRIAL_DAYS),
			-4,
		);
		expect(
			preview.line_items.some(
				(lineItem) => lineItem.feature_id === TestFeature.Messages,
			),
		).toBe(false);
		expect(preview.total).toBe(BASE_PRICE);

		const stripeInvoiceId = await advanceToIssuedInvoice({
			stripeCli: ctx.stripeCli,
			autumnV1,
			customerId,
			testClockId: testClockId!,
			advancedTo,
			numberOfDays: TRIAL_DAYS,
		});
		await expectInvoicePreviewMatchesStripeInvoice({
			stripeCli: ctx.stripeCli,
			preview,
			stripeInvoiceId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoice-previews trial: non-trial renewal preview still bills the cycle's usage")}`,
	async () => {
		const customerId = "invoice-previews-renewal-usage";
		const { ctx, autumnV1, autumnV2_2, testClockId, advancedTo } =
			await setupTieredConsumable({ customerId });

		const preview = await getInvoicePreview({ autumnV2_2, customerId });
		const usageLine = preview.line_items.find(
			(lineItem) => lineItem.feature_id === TestFeature.Messages,
		);
		expect(usageLine?.subtotal).toBeGreaterThan(0);

		const stripeInvoiceId = await advanceToIssuedInvoice({
			stripeCli: ctx.stripeCli,
			autumnV1,
			customerId,
			testClockId: testClockId!,
			advancedTo,
		});
		await expectInvoicePreviewMatchesStripeInvoice({
			stripeCli: ctx.stripeCli,
			preview,
			stripeInvoiceId,
		});
	},
);
