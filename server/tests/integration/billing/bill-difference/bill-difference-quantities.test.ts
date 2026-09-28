/**
 * proration_behavior: "bill_difference" on mid-cycle quantity increases.
 *
 * Contract (each on day 14 of a monthly cycle):
 *   credit packs 300 -> 500 ($10 / 100) charges $20, seats 5 -> 8 ($10 each) charges $30,
 *   licenses 3 -> 5 ($20 each) charges $40. Balances are granted as today; renewal date unchanged.
 */

import { expect, test } from "bun:test";
import type {
	BillingPreviewResponse,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import {
	expectAnchorQuantityIdentity,
	setupAnchorQuantityScenario,
} from "@tests/integration/billing/update-subscription/params/billing-cycle-anchor/setupAnchorQuantityScenario";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";

type Scenario = Awaited<ReturnType<typeof setupAnchorQuantityScenario>>;

const billDifference = async ({
	scenario,
	params,
	expectedTotal,
}: {
	scenario: Scenario;
	params: Omit<UpdateSubscriptionV1ParamsInput, "customer_id">;
	expectedTotal: number;
}) => {
	const { autumnV2_4, ctx, customerId, target } = scenario;
	const body: UpdateSubscriptionV1ParamsInput = {
		...target,
		...params,
		proration_behavior: "bill_difference",
	};

	const preview: BillingPreviewResponse =
		await autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
			body,
		);
	expect(preview.total).toEqual(expectedTotal);

	await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>(body);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: expectedTotal,
	});
	await expectAnchorQuantityIdentity({
		scenario,
		anchorMs: scenario.subscription.billing_cycle_anchor * 1000,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
};

test.concurrent(
	`${chalk.yellowBright("bill_difference: credit pack increase charges full packs")}`,
	async () => {
		const scenario = await setupAnchorQuantityScenario({
			customerId: "bill-diff-credit-pack",
		});

		await billDifference({
			scenario,
			params: {
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 500 },
				],
			},
			expectedTotal: 20,
		});

		await expectBalanceCorrect({
			customerId: scenario.customerId,
			autumn: scenario.autumnV2_4,
			featureId: TestFeature.Messages,
			remaining: 500,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("bill_difference: seat increase charges full seats")}`,
	async () => {
		const scenario = await setupAnchorQuantityScenario({
			customerId: "bill-diff-seats",
			extraItems: [items.prepaidUsers()],
			extraQuantities: [{ feature_id: TestFeature.Users, quantity: 5 }],
		});

		await billDifference({
			scenario,
			params: {
				feature_quantities: [{ feature_id: TestFeature.Users, quantity: 8 }],
			},
			expectedTotal: 30,
		});

		await expectBalanceCorrect({
			customerId: scenario.customerId,
			autumn: scenario.autumnV2_4,
			featureId: TestFeature.Users,
			remaining: 8,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("bill_difference: license increase charges full licenses")}`,
	async () => {
		const scenario = await setupAnchorQuantityScenario({
			customerId: "bill-diff-licenses",
			seats: 3,
		});

		await billDifference({
			scenario,
			params: {
				license_quantities: [
					{ license_plan_id: scenario.licensePlan.id, quantity: 5 },
				],
			},
			expectedTotal: 40,
		});

		expectCustomerLicenses({
			customer: await scenario.readCustomer(),
			count: 1,
			licenses: [
				{
					license_plan_id: scenario.licensePlan.id,
					parent_plan_id: scenario.plan.id,
					granted: 5,
					paid_quantity: 5,
				},
			],
		});
	},
);
