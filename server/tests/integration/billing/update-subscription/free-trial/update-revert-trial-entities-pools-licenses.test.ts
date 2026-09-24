/**
 * billing.update on a revert trial across entities, pooled balances and licenses.
 * Extending the trial must leave the shared Stripe subscription and sibling state
 * untouched, and trial expiry must still revert the replacement customer product.
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
	expireRevertTrial,
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

const expectSeatParent = async ({
	ctx,
	customerId,
	parentCustomerProductId,
}: {
	ctx: TestContext;
	customerId: string;
	parentCustomerProductId: string;
}) => {
	const { assignments, pools } = await getLicenseDbState({
		db: ctx.db,
		customerId,
	});
	expect(assignments).toHaveLength(1);
	const [assignment] = assignments;
	expect(assignment.status).toBe(CusProductStatus.Active);

	const assignmentPool = pools.find(
		(pool) =>
			pool.link_id === assignment.customer_license_link_id &&
			pool.parent_customer_product_id === parentCustomerProductId,
	);
	expect(assignmentPool).toBeDefined();
};

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
			entityId,
			siblingEntity,
			trialCustomerProduct,
			subscriptionBefore,
		} = await setupEntityRevertTrial({ customerId });

		await extendRevertTrial({
			autumn: autumnV2_3,
			customerId,
			subscriptionId: trialCustomerProduct.id,
			entityId,
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

		await expireRevertTrial({
			ctx,
			trialCustomerProduct: extendedTrial,
		});

		const { fullCustomer } = await expectRevertTrialReverted({
			ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
			entityId,
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
			entityId,
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

		await expireRevertTrial({
			ctx,
			trialCustomerProduct: extendedTrial,
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
			entityId,
			trialCustomerProduct,
			subscriptionBefore,
		} = await setupLicenseRevertTrial({ customerId });

		await extendRevertTrial({
			autumn: autumnV2_3,
			customerId,
			subscriptionId: trialCustomerProduct.id,
			entityId,
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
		await expectSeatParent({
			ctx,
			customerId,
			parentCustomerProductId: extendedTrial.id,
		});

		await expireRevertTrial({
			ctx,
			trialCustomerProduct: extendedTrial,
		});

		const { restoredCustomerProduct } = await expectRevertTrialReverted({
			ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
		});
		await expectSeatParent({
			ctx,
			customerId,
			parentCustomerProductId: restoredCustomerProduct.id,
		});
	},
);
