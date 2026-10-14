import { test } from "bun:test";
import { AllocatedBillingBehavior } from "@autumn/shared";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const volumeAllocatedWorkflows = () =>
	items.volumeAllocated({
		featureId: TestFeature.Workflows,
		includedUsage: 2,
		allocatedBillingBehavior: AllocatedBillingBehavior.Arrear,
	});

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
	`${chalk.yellowBright("allocated-volume-workflows 1: +8 +7 −2 ends at 13, 11 over (net band 2): 11 × $8 = $88; preview = invoice")}`,
	async () => {
		await runWorkflowsRenewal({
			customerId: "alloc-volume-workflows-band2",
			trackedValues: [8, 7, -2],
			expectedFeatureAmount: 88,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocated-volume-workflows 2: +8 +7 −5 crosses net band 2 then ends at 10, 8 over (net band 1): 8 × $10 = $80; preview = invoice")}`,
	async () => {
		await runWorkflowsRenewal({
			customerId: "alloc-volume-workflows-back-band1",
			trackedValues: [8, 7, -5],
			expectedFeatureAmount: 80,
		});
	},
);
