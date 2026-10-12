import { expect } from "bun:test";
import {
	type ApiCustomerV5,
	CustomerExpand,
	type LimitedItem,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";

export type VolumeScenario = Awaited<
	ReturnType<typeof setupVolumeConsumable>
>["scenario"];

type PreviewLineItem = NonNullable<
	ApiCustomerV5["invoice_previews"]
>[number]["line_items"][number];

const byDescription = <T extends { description: string | null }>(lines: T[]) =>
	[...lines].sort((a, b) =>
		(a.description ?? "").localeCompare(b.description ?? ""),
	);

export const listStripeInvoiceLines = async ({
	stripeCli,
	invoiceId,
}: {
	stripeCli: Stripe;
	invoiceId: string;
}) => {
	const lines: Stripe.InvoiceLineItem[] = [];
	for await (const line of stripeCli.invoices.listLineItems(invoiceId, {
		limit: 100,
	})) {
		lines.push(line);
	}
	return lines;
};

/** The non-zero lines Autumn added to a Stripe invoice, as major-unit amounts. */
export const stripeLinesToAutumnLines = (lines: Stripe.InvoiceLineItem[]) =>
	byDescription(
		lines
			.filter((line) => line.metadata?.autumn_line_item_id && line.amount !== 0)
			.map((line) => ({
				description: line.description,
				amount: stripeToAtmnAmount({
					amount: line.amount,
					currency: line.currency,
				}),
			})),
	);

/** The non-zero preview lines for one feature, shaped like `stripeLinesToAutumnLines`. */
export const previewLinesForFeature = ({
	lineItems,
	featureId,
}: {
	lineItems: PreviewLineItem[];
	featureId: string;
}) =>
	byDescription(
		lineItems
			.filter(
				(lineItem) =>
					lineItem.feature_id === featureId && lineItem.subtotal !== 0,
			)
			.map((lineItem) => ({
				description: lineItem.description,
				amount: lineItem.subtotal,
			})),
	);

export const getInvoicePreview = async ({
	scenario,
}: {
	scenario: VolumeScenario;
}) => {
	const { invoice_previews } =
		await scenario.autumnV2_2.customers.get<ApiCustomerV5>(
			scenario.customerId,
			{ expand: [CustomerExpand.InvoicePreviews] },
		);
	expect(invoice_previews).toHaveLength(1);
	return invoice_previews![0];
};

export const sumFeatureSubtotal = ({
	lineItems,
	featureId,
}: {
	lineItems: PreviewLineItem[];
	featureId: string;
}) =>
	lineItems
		.filter((lineItem) => lineItem.feature_id === featureId)
		.reduce((sum, lineItem) => sum + lineItem.subtotal, 0);

/**
 * Advances one cycle from `cycleStart` and asserts the renewal invoice equals the
 * upcoming-invoice preview: totals, the feature's amount, and the feature's lines.
 */
export const expectVolumeRenewalCorrect = async ({
	scenario,
	featureId = TestFeature.Messages,
	expectedFeatureAmount,
	cycleStart = scenario.advancedTo,
	compareStripeLines = true,
}: {
	scenario: VolumeScenario;
	featureId?: string;
	expectedFeatureAmount: number;
	cycleStart?: number;
	compareStripeLines?: boolean;
}) => {
	const { preview, renewalInvoice } = await expectNextInvoiceMatchesPreview({
		ctx: scenario.ctx,
		autumnV1: scenario.autumnV1,
		autumnV2_2: scenario.autumnV2_2,
		customerId: scenario.customerId,
		testClockId: scenario.testClockId!,
		advancedTo: cycleStart,
		featureId,
		expectedFeatureAmount,
	});
	expect(preview.total).toBeGreaterThanOrEqual(0);

	const stripeLines = await listStripeInvoiceLines({
		stripeCli: scenario.ctx.stripeCli,
		invoiceId: renewalInvoice.stripe_id,
	});
	if (compareStripeLines) {
		expect(stripeLinesToAutumnLines(stripeLines)).toEqual(
			previewLinesForFeature({ lineItems: preview.line_items, featureId }),
		);
	}

	return { preview, renewalInvoice, stripeLines };
};

/** Attaches a $20 pro plan with `item`, tracks `usage` messages, and returns the scenario. */
export const setupVolumeConsumable = async ({
	customerId,
	item,
	usage,
}: {
	customerId: string;
	item: LimitedItem;
	usage: number;
}) => {
	const pro = products.pro({ id: customerId, items: [item] });
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			...(usage > 0
				? [
						s.track({
							featureId: TestFeature.Messages,
							value: usage,
							timeout: 3000,
						}),
					]
				: []),
		],
	});
	return { scenario, pro };
};

export const advanceMidCycle = async ({
	scenario,
	days = 15,
}: {
	scenario: VolumeScenario;
	days?: number;
}) =>
	advanceTestClock({
		stripeCli: scenario.ctx.stripeCli,
		testClockId: scenario.testClockId!,
		startingFrom: new Date(scenario.advancedTo),
		numberOfDays: days,
	});
