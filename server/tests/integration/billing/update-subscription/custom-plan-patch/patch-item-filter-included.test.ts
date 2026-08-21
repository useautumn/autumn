/**
 * Per-customer subscriptions.update honors included on remove_items.
 * The important case is a row that does NOT match the filter and must stay put.
 *
 * Contract:
 *   P1 custom 1k + filter included: 100 → 1k kept, one messages row
 *   P2 omitted included still rewrites 1k → 200 (wildcard)
 *   P3 paid overage at 200 + filter included: 50 → 200 kept
 *   unmatched 100→200 + leftover boolean/lifetime: 1k spared, leftovers land
 */

import { test } from "bun:test";
import {
	ResetInterval,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { readScopedFeatureRow } from "@tests/integration/billing/migrations-v2/batch-migrations/paidRowTestUtils";
import { expectIncludedFilterOutcomeCorrect } from "@tests/integration/billing/migrations-v2/utils/expectIncludedFilterOutcomeCorrect";
import {
	expectUnmatchedReplaceLeftoversCorrect,
	unmatchedReplaceLeftoverCustomize,
} from "@tests/integration/billing/migrations-v2/utils/expectUnmatchedReplaceLeftoversCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const CATALOG_ALLOWANCE = 100;
const CUSTOM_1K_ALLOWANCE = 1000;
const REPLACEMENT_ALLOWANCE = 200;
const PAID_INCLUDED = 50;
const PAID_CUSTOM = 200;

const wildcardRemove = {
	feature_id: TestFeature.Messages,
	interval: ResetInterval.Month,
};

const includedCatalogRemove = {
	...wildcardRemove,
	included: CATALOG_ALLOWANCE,
};

const customizeToGrant = ({
	included,
	paid = false,
}: {
	included: number;
	paid?: boolean;
}): UpdateSubscriptionV1ParamsInput["customize"] => ({
	remove_items: [wildcardRemove],
	add_items: [
		paid
			? { ...itemsV2.consumableMessages({ amount: 0.1 }), included }
			: itemsV2.monthlyMessages({ included }),
	],
});

const updateSubscriptionAllowingNoop = async ({
	autumn,
	params,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	params: UpdateSubscriptionV1ParamsInput;
}) => {
	try {
		await autumn.subscriptions.update<UpdateSubscriptionV1ParamsInput>(params);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!message.includes("identical to the current subscription")) throw error;
	}
};

test.concurrent(
	`${chalk.yellowBright("patch item filters: included 100 does not migrate a custom 1k row")}`,
	async () => {
		const customerId = "patch-filter-included-spare-1k";
		const plan = products.base({
			id: "patch-filter-included-spare",
			items: [items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			customize: customizeToGrant({ included: CUSTOM_1K_ALLOWANCE }),
		});

		const before = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await updateSubscriptionAllowingNoop({
			autumn: autumnV2_3,
			params: {
				customer_id: customerId,
				plan_id: plan.id,
				customize: {
					remove_items: [includedCatalogRemove],
					add_items: [
						itemsV2.monthlyMessages({ included: REPLACEMENT_ALLOWANCE }),
					],
				},
			},
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_3,
			active: [plan.id],
		});
		await expectIncludedFilterOutcomeCorrect({
			ctx,
			autumn: autumnV2_3,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			before,
			granted: CUSTOM_1K_ALLOWANCE,
			spared: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("patch item filters: omitted included still rewrites a custom 1k row")}`,
	async () => {
		const customerId = "patch-filter-included-wildcard-1k";
		const plan = products.base({
			id: "patch-filter-included-wild",
			items: [items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			customize: customizeToGrant({ included: CUSTOM_1K_ALLOWANCE }),
		});

		const before = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			customize: {
				remove_items: [wildcardRemove],
				add_items: [
					itemsV2.monthlyMessages({ included: REPLACEMENT_ALLOWANCE }),
				],
			},
		});

		await expectIncludedFilterOutcomeCorrect({
			ctx,
			autumn: autumnV2_3,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			before,
			granted: REPLACEMENT_ALLOWANCE,
			spared: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("patch item filters: included 50 does not migrate a paid 200 overage row")}`,
	async () => {
		const customerId = "patch-filter-included-paid-spare";
		const plan = products.pro({
			id: "patch-filter-included-paid",
			items: [items.consumableMessages({ includedUsage: PAID_INCLUDED })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			customize: customizeToGrant({ included: PAID_CUSTOM, paid: true }),
		});

		const before = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await updateSubscriptionAllowingNoop({
			autumn: autumnV2_3,
			params: {
				customer_id: customerId,
				plan_id: plan.id,
				customize: {
					remove_items: [
						{
							feature_id: TestFeature.Messages,
							interval: ResetInterval.Month,
							included: PAID_INCLUDED,
						},
					],
					add_items: [
						{
							...itemsV2.consumableMessages({ amount: 0.1 }),
							included: CATALOG_ALLOWANCE,
						},
					],
				},
			},
		});

		await expectIncludedFilterOutcomeCorrect({
			ctx,
			autumn: autumnV2_3,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			before,
			granted: PAID_CUSTOM,
			spared: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("patch item filters: unmatched 100→200 still adds boolean and lifetime")}`,
	async () => {
		const customerId = "patch-filter-unmatched-leftover";
		const plan = products.base({
			id: "patch-filter-unmatched-leftover",
			items: [items.monthlyMessages({ includedUsage: CATALOG_ALLOWANCE })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			customize: customizeToGrant({ included: CUSTOM_1K_ALLOWANCE }),
		});

		const beforeMonthly = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: plan.id,
			customize: unmatchedReplaceLeftoverCustomize(),
		});

		await expectUnmatchedReplaceLeftoversCorrect({
			ctx,
			autumn: autumnV2_3,
			customerId,
			planId: plan.id,
			beforeMonthly,
		});
	},
);
