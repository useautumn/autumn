/**
 * Allocated v2 (arrear) volume on Workflows: the renewal bills current holdings,
 * every workflow at the band the total lands in. Preview must equal the invoice.
 */

import { test } from "bun:test";
import {
	AllocatedBillingBehavior,
	type LimitedItem,
	TierBehavior,
} from "@autumn/shared";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

// Net tiers 0-10 @ $10, 11+ @ $8 with 2 included: total bands 0-12 / 13+.
const volumeAllocatedWorkflows = (): LimitedItem =>
	({
		...constructArrearProratedItem({
			featureId: TestFeature.Workflows,
			includedUsage: 2,
			config: { allocated_billing_behavior: AllocatedBillingBehavior.Arrear },
		}),
		price: undefined,
		tiers: [
			{ to: 10, amount: 10 },
			{ to: "inf", amount: 8 },
		],
		tier_behavior: TierBehavior.VolumeBased,
	}) as LimitedItem;

const runWorkflowsRenewal = async ({
	customerId,
	trackedValues,
	expectedFeatureAmount,
}: {
	customerId: string;
	trackedValues: number[];
	expectedFeatureAmount: number;
}) => {
	const pro = products.pro({
		id: customerId,
		items: [volumeAllocatedWorkflows()],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			...trackedValues.map((value) =>
				s.track({ featureId: TestFeature.Workflows, value, timeout: 2_000 }),
			),
		],
	});

	const { renewalInvoice } = await expectNextInvoiceMatchesPreview({
		ctx: scenario.ctx,
		autumnV1: scenario.autumnV1,
		autumnV2_2: scenario.autumnV2_2,
		customerId,
		testClockId: scenario.testClockId!,
		advancedTo: scenario.advancedTo,
		featureId: TestFeature.Workflows,
		expectedFeatureAmount,
	});
	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice.stripe_id,
		expectedTotal: renewalInvoice.total,
		expectedLineItems: [
			{
				featureId: TestFeature.Workflows,
				billingTiming: "in_arrear",
				totalAmount: expectedFeatureAmount,
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("allocated-volume-workflows 1: +8 +7 −2 ends at 13 (band 2): 13 × $8 = $104; preview = invoice")}`,
	async () => {
		await runWorkflowsRenewal({
			customerId: "alloc-volume-workflows-band2",
			trackedValues: [8, 7, -2],
			expectedFeatureAmount: 104,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocated-volume-workflows 2: +8 +7 −5 crosses band 2 then ends at 10 (band 1): 10 × $10 = $100; preview = invoice")}`,
	async () => {
		await runWorkflowsRenewal({
			customerId: "alloc-volume-workflows-back-band1",
			trackedValues: [8, 7, -5],
			expectedFeatureAmount: 100,
		});
	},
);
