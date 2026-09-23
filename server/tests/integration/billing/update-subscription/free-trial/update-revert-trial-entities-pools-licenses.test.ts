/**
 * billing.update on a revert trial across entities, pooled balances and licenses.
 * Extending the trial must leave the shared Stripe subscription and sibling state
 * untouched, and the expiry cron must still revert the replacement customer product.
 *
 * Contract:
 *   entities:  entity 0 trial extended → entity 1's Pro stays active; expiry restores entity 0's Pro
 *   pooled:    extended trial keeps the Enterprise pool grant; expiry restores the Pro grant
 *   licenses:  assignments follow the replacement trial parent; expiry reparents them to Pro
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	ms,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import {
	POOL_ENTERPRISE_GRANT,
	POOL_PRO_GRANT,
	setupEntityRevertTrial,
	setupLicenseRevertTrial,
	setupPooledRevertTrial,
} from "./utils/revertTrialScopedSetups";
import {
	EXTENDED_TRIAL_DAYS,
	expectRevertTrialAfterUpdate,
	expectRevertTrialReverted,
	expectSharedSubscriptionUntouched,
	expireRevertTrialViaCron,
	extendRevertTrial,
} from "./utils/revertTrialUtils";

const POOL_SOURCES_AFTER_EXTENSION = 3;

const expectPoolGrant = ({
	ctx,
	customerId,
	granted,
}: {
	ctx: TestContext;
	customerId: string;
	granted: number;
}) =>
	expectPooledBalanceCorrect({
		db: ctx.db,
		customerId,
		pool: {
			balance: granted,
			adjustment: 0,
			granted,
			interval: EntInterval.Month,
			nextResetAt: "present",
			resetCycleAnchor: "present",
			resetMode: PooledBalanceResetMode.Subscription,
			stripeSubscriptionId: "stripe_subscription",
		},
		contributions: {
			count: 1,
			currentContribution: granted,
			nextCycleContribution: granted,
		},
		sources: {
			count: POOL_SOURCES_AFTER_EXTENSION,
			balance: 0,
			adjustment: 0,
		},
	});

test.concurrent(
	`${chalk.yellowBright("update-revert-trial scoped 1: entity trial extended — sibling entity and shared sub untouched")}`,
	async () => {
		const customerId = "upd-revert-trial-entities";
		const {
			autumnV2_3,
			ctx,
			advancedTo,
			pro,
			enterprise,
			trialEntity,
			siblingEntity,
			trialCustomerProduct,
			subscriptionBefore,
		} = await setupEntityRevertTrial({ customerId });

		await extendRevertTrial({
			autumn: autumnV2_3,
			customerId,
			subscriptionId: trialCustomerProduct.id,
		});
		const { trialCustomerProduct: extendedTrial } =
			await expectRevertTrialAfterUpdate({
				ctx,
				customerId,
				trialProductId: enterprise.id,
				pausedProductId: pro.id,
				subscriptionBefore,
				expectedTrialEndsAt: advancedTo + ms.days(EXTENDED_TRIAL_DAYS),
				entityId: trialEntity.id,
			});

		await expireRevertTrialViaCron({
			ctx,
			trialCustomerProductId: extendedTrial.id,
		});

		const { fullCustomer } = await expectRevertTrialReverted({
			ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
			entityId: trialEntity.id,
		});
		const siblingPro = fullCustomer.customer_products.find(
			(customerProduct) =>
				customerProduct.product_id === pro.id &&
				customerProduct.entity_id === siblingEntity.id,
		);
		expect(siblingPro?.status).toBe(CusProductStatus.Active);
		await expectSharedSubscriptionUntouched({ ctx, subscriptionBefore });
	},
);

test.concurrent(
	`${chalk.yellowBright("update-revert-trial scoped 2: pooled trial extended keeps Enterprise pool; expiry restores Pro pool")}`,
	async () => {
		const customerId = "upd-revert-trial-pooled";
		const {
			autumnV2_3,
			ctx,
			advancedTo,
			pro,
			enterprise,
			entityId,
			trialCustomerProduct,
			subscriptionBefore,
		} = await setupPooledRevertTrial({ customerId });

		await extendRevertTrial({
			autumn: autumnV2_3,
			customerId,
			subscriptionId: trialCustomerProduct.id,
		});
		const { trialCustomerProduct: extendedTrial } =
			await expectRevertTrialAfterUpdate({
				ctx,
				customerId,
				trialProductId: enterprise.id,
				pausedProductId: pro.id,
				subscriptionBefore,
				expectedTrialEndsAt: advancedTo + ms.days(EXTENDED_TRIAL_DAYS),
				entityId,
			});
		await expectPoolGrant({ ctx, customerId, granted: POOL_ENTERPRISE_GRANT });

		await expireRevertTrialViaCron({
			ctx,
			trialCustomerProductId: extendedTrial.id,
		});

		await expectRevertTrialReverted({
			ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
			entityId,
		});
		await expectPoolGrant({ ctx, customerId, granted: POOL_PRO_GRANT });
	},
);

test.concurrent(
	`${chalk.yellowBright("update-revert-trial scoped 3: license assignment follows extended trial; expiry reparents to Pro")}`,
	async () => {
		const customerId = "upd-revert-trial-licenses";
		const {
			autumnV2_3,
			ctx,
			pro,
			enterprise,
			trialCustomerProduct,
			subscriptionBefore,
		} = await setupLicenseRevertTrial({ customerId });

		await extendRevertTrial({
			autumn: autumnV2_3,
			customerId,
			subscriptionId: trialCustomerProduct.id,
		});
		const { trialCustomerProduct: extendedTrial } =
			await expectRevertTrialAfterUpdate({
				ctx,
				customerId,
				trialProductId: enterprise.id,
				pausedProductId: pro.id,
				subscriptionBefore,
				expectedTrialEndsAt: Date.now() + ms.days(EXTENDED_TRIAL_DAYS),
			});
		const extendedState = await getLicenseDbState({ db: ctx.db, customerId });
		expect(extendedState.assignments).toHaveLength(1);
		expect(extendedState.assignments[0]).toMatchObject({
			status: CusProductStatus.Active,
			license_parent_customer_product_id: extendedTrial.id,
		});

		await expireRevertTrialViaCron({
			ctx,
			trialCustomerProductId: extendedTrial.id,
		});

		const { restoredCustomerProduct } = await expectRevertTrialReverted({
			ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
		});
		const revertedState = await getLicenseDbState({ db: ctx.db, customerId });
		expect(revertedState.assignments[0]).toMatchObject({
			status: CusProductStatus.Active,
			license_parent_customer_product_id: restoredCustomerProduct.id,
		});
		const restoredPools = revertedState.pools.filter(
			(pool) => pool.parent_customer_product_id === restoredCustomerProduct.id,
		);
		expect(restoredPools).toHaveLength(1);
	},
);
