/**
 * Parity twin of `migration-oneoff-addon-version`: an add-on plan version adds
 * a feature with no invoice on either lane. The twin add-on is FREE (no base
 * price) — versioned base-price rows are re-minted per version, so a priced
 * addon rejects to the per-customer lane and never reaches batch parity.
 */
import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import {
	expectActivePlanVersion,
	migrateVersionOnBatchLane,
	migrateVersionOnPerCustomerLane,
	mintPlanVersion,
	uniqueStem,
} from "./versionParityTestUtils";

// itemsV2 has no free lifetime builder; omitting `reset` is what makes it lifetime.
const lifetimeMessagesV2 = ({ included }: { included: number }) => ({
	feature_id: TestFeature.Messages,
	included,
});

test.concurrent(
	`${chalk.yellowBright("batch version repoint parity: one-off addon version invoices neither lane")}`,
	async () => {
		const stem = uniqueStem("bvr-parity-addon");
		const batchCustomerId = `${stem}-batch`;
		const perCustomerId = `${stem}-customer`;
		const addonPlan = ({ id }: { id: string }) =>
			products.base({
				id,
				isAddOn: true,
				items: [items.lifetimeMessages({ includedUsage: 100 })],
			});
		const batchPlan = addonPlan({ id: `${stem}-plan-a` });
		const perCustomerPlan = addonPlan({ id: `${stem}-plan-b` });
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId: batchCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: perCustomerId }]),
				s.products({ list: [batchPlan, perCustomerPlan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: batchPlan.id }),
					s.billing.attach({
						customerId: perCustomerId,
						productId: perCustomerPlan.id,
					}),
				),
			],
		});

		for (const planId of [batchPlan.id, perCustomerPlan.id]) {
			await mintPlanVersion({
				autumnV2_3,
				planId,
				items: [lifetimeMessagesV2({ included: 100 }), itemsV2.dashboard()],
			});
		}
		await migrateVersionOnBatchLane({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-batch-migration`,
			planId: batchPlan.id,
		});
		await migrateVersionOnPerCustomerLane({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-customer-migration`,
			planId: perCustomerPlan.id,
			customerId: perCustomerId,
		});

		for (const [customerId, planId] of [
			[batchCustomerId, batchPlan.id],
			[perCustomerId, perCustomerPlan.id],
		] as const) {
			expectBalanceCorrect({
				customer: await autumnV2_3.customers.get<ApiCustomerV5>(customerId),
				featureId: TestFeature.Messages,
				remaining: 100,
				usage: 0,
				planId,
				nextResetAt: null,
			});
			await readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Dashboard,
			});
			const customerV3 =
				await autumnV1.customers.get<ApiCustomerV3>(customerId);
			expect(customerV3.features?.[TestFeature.Dashboard]).toBeDefined();
			await expectCustomerInvoiceCorrect({ customer: customerV3, count: 0 });
			await expectActivePlanVersion({ ctx, customerId, planId, version: 2 });
		}
	},
);
