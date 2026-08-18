/**
 * Parity twin of `migration-free-trial-carryover`: a trialing customer keeps
 * their trial through a version update on both lanes. The trial CONFIG is
 * identical across v1/v2 (updateProduct carries free_trial on force_version;
 * config changes reject with free_trial_transition and belong to fallbacks/).
 */
import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import {
	expectProductTrialing,
	getTrialEndsAt,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
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

const TRIAL_DAYS = 14;
const TEN_MINUTES_MS = 10 * 60 * 1_000;

test.concurrent(
	`${chalk.yellowBright("batch version repoint parity: trial state is equal across lanes")}`,
	async () => {
		const stem = uniqueStem("bvr-parity-trial");
		const batchCustomerId = `${stem}-batch`;
		const perCustomerId = `${stem}-customer`;
		const trialPlan = ({ id }: { id: string }) =>
			products.baseWithTrial({
				id,
				items: [items.monthlyMessages({ includedUsage: 100 })],
				trialDays: TRIAL_DAYS,
				cardRequired: false,
			});
		const batchPlan = trialPlan({ id: `${stem}-plan-a` });
		const perCustomerPlan = trialPlan({ id: `${stem}-plan-b` });
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

		const pairs = [
			[batchCustomerId, batchPlan.id],
			[perCustomerId, perCustomerPlan.id],
		] as const;
		const trialEndsBefore = new Map<string, number>();
		for (const [customerId, planId] of pairs) {
			const trialEndsAt = await getTrialEndsAt({
				customer: await autumnV2_3.customers.get<ApiCustomerV5>(customerId),
				productId: planId,
			});
			expect(trialEndsAt).not.toBeNull();
			trialEndsBefore.set(customerId, trialEndsAt as number);

			await autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 20,
			});
			await pollUntil({
				fetch: () =>
					readScopedFeatureRow({
						ctx,
						customerId,
						featureId: TestFeature.Messages,
					}),
				until: (row) => row.balance === 80,
				timeoutMs: 15_000,
				intervalMs: 250,
			});
		}

		for (const planId of [batchPlan.id, perCustomerPlan.id]) {
			await mintPlanVersion({
				autumnV2_3,
				planId,
				items: [itemsV2.monthlyMessages({ included: 200 })],
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

		for (const [customerId, planId] of pairs) {
			const customer =
				await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
			await expectProductTrialing({
				customer,
				productId: planId,
				trialEndsAt: trialEndsBefore.get(customerId),
			});
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Messages,
				remaining: 180,
				usage: 20,
				planId,
			});
			await expectActivePlanVersion({ ctx, customerId, planId, version: 2 });
		}

		// Twins attached together, so their trial ends must agree across lanes.
		expect(
			Math.abs(
				(trialEndsBefore.get(batchCustomerId) as number) -
					(trialEndsBefore.get(perCustomerId) as number),
			),
		).toBeLessThan(TEN_MINUTES_MS);
	},
);
