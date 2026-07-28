/** TDD contract: cron expiry removes a pooled trial source and restores its paused source. */
// The monthly pool is reused, and its contribution graph changes without duplication.

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	EntInterval,
	FreeTrialDuration,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { runProductCron } from "@/cron/productCron/runProductCron";
import { db } from "@/db/initDrizzle";
import { logger } from "@/external/logtail/logtailUtils";
import { CusService } from "@/internal/customers/CusService";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect";
import { getPooledSourceCustomerProduct } from "../utils/getPooledBalanceDbState";

const PRO_GRANT = 100;
const ENTERPRISE_GRANT = 300;
const MONTHLY_POOL_LIFECYCLE = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Subscription,
	stripeSubscriptionId: "stripe_subscription",
} as const;

test(
	chalk.yellowBright(
		"pooled product cron: enterprise trial expiry restores the paused plan contribution",
	),
	async () => {
		const customerId = "pooled-trial-revert-cron";
		const pro = products.pro({
			id: "pooled-trial-revert-pro",
			items: [
				{
					...items.monthlyMessages({ includedUsage: PRO_GRANT }),
					pooled: true,
				},
			],
		});
		const enterprise = products.premium({
			id: "pooled-trial-revert-enterprise",
			items: [
				{
					...items.monthlyMessages({ includedUsage: ENTERPRISE_GRANT }),
					pooled: true,
				},
			],
		});
		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pro, enterprise] }),
			],
			actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
		});

		const proState = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: PRO_GRANT,
				adjustment: 0,
				granted: PRO_GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				currentContribution: PRO_GRANT,
				nextCycleContribution: PRO_GRANT,
			},
			sources: { count: 1, balance: 0, adjustment: 0 },
		});
		const proCustomerProduct = getPooledSourceCustomerProduct({
			state: proState,
			productId: pro.id,
			entityId: entities[0].id,
		});
		const proContribution = proState.contributions[0];
		if (!proContribution) throw new Error("Expected the Pro contribution");

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: enterprise.id,
			redirect_mode: "if_required",
			customize: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		});

		const trialState = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: ENTERPRISE_GRANT,
				adjustment: 0,
				granted: ENTERPRISE_GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				currentContribution: ENTERPRISE_GRANT,
				nextCycleContribution: ENTERPRISE_GRANT,
				excludedSourceCustomerProductIds: [proCustomerProduct.id],
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		const enterpriseCustomerProduct = getPooledSourceCustomerProduct({
			state: trialState,
			productId: enterprise.id,
			entityId: entities[0].id,
		});
		const enterpriseContribution = trialState.contributions[0];
		if (!enterpriseContribution) {
			throw new Error("Expected the Enterprise contribution");
		}

		const beforeCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});
		expect(
			beforeCron.customer_products.find(
				(customerProduct) => customerProduct.id === proCustomerProduct.id,
			)?.status,
		).toBe(CusProductStatus.Paused);
		expect(
			beforeCron.customer_products.find(
				(customerProduct) =>
					customerProduct.id === enterpriseCustomerProduct.id,
			)?.status,
		).toBe(CusProductStatus.Active);

		await db
			.update(customerProducts)
			.set({ trial_ends_at: Date.now() - 60_000 })
			.where(eq(customerProducts.id, enterpriseCustomerProduct.id));

		await runProductCron({ ctx: { db, logger } });

		const afterCron = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});
		expect(
			afterCron.customer_products.find(
				(customerProduct) => customerProduct.id === proCustomerProduct.id,
			)?.status,
		).toBe(CusProductStatus.Active);
		expect(
			afterCron.customer_products.find(
				(customerProduct) =>
					customerProduct.id === enterpriseCustomerProduct.id,
			)?.status,
		).toBe(CusProductStatus.Expired);

		const revertedState = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: PRO_GRANT,
				adjustment: 0,
				granted: PRO_GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				currentContribution: PRO_GRANT,
				nextCycleContribution: PRO_GRANT,
				excludedSourceCustomerProductIds: [enterpriseCustomerProduct.id],
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		expect(revertedState.contributions[0]?.source_customer_entitlement_id).toBe(
			proContribution.source_customer_entitlement_id,
		);

		const [restoredSource, expiredTrialSource] = await Promise.all([
			ctx.db.query.customerEntitlements.findFirst({
				where: eq(
					customerEntitlements.id,
					proContribution.source_customer_entitlement_id,
				),
			}),
			ctx.db.query.customerEntitlements.findFirst({
				where: eq(
					customerEntitlements.id,
					enterpriseContribution.source_customer_entitlement_id,
				),
			}),
		]);
		expect(restoredSource?.pooled_contribution_id).toBe(
			revertedState.contributions[0]?.id,
		);
		expect(expiredTrialSource?.pooled_contribution_id).toBeNull();
	},
);
