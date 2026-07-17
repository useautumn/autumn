import {
	type AutumnBillingPlan,
	CusProductStatus,
	type customerProducts,
	customerProducts as customerProductsTable,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { and, eq, type InferSelectModel } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { withCustomerBalanceSyncLock } from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import {
	applyPreparedPooledBalanceCacheCutover,
	executePooledBalanceOps,
} from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { CusService } from "@/internal/customers/CusService";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

const updateRevertTrialStatuses = async ({
	db,
	trialCustomerProductId,
	previousCustomerProductId,
	now,
}: {
	db: DrizzleCli;
	trialCustomerProductId: string;
	previousCustomerProductId: string;
	now: number;
}): Promise<boolean> => {
	await db
		.update(customerProductsTable)
		.set({ status: CusProductStatus.Expired, updated_at: now })
		.where(eq(customerProductsTable.id, trialCustomerProductId));

	const restoredCustomerProducts = await db
		.update(customerProductsTable)
		.set({ status: CusProductStatus.Active, updated_at: now })
		.where(
			and(
				eq(customerProductsTable.id, previousCustomerProductId),
				eq(customerProductsTable.status, CusProductStatus.Paused),
			),
		)
		.returning({ id: customerProductsTable.id });

	return restoredCustomerProducts.length > 0;
};

type ExecutePooledRevertTrialExpiryDependencies = {
	withCustomerBalanceSyncLock: typeof withCustomerBalanceSyncLock;
	updateRevertTrialStatuses: typeof updateRevertTrialStatuses;
	executePooledBalanceOps: typeof executePooledBalanceOps;
	applyPooledBalanceCacheCutover: typeof applyPreparedPooledBalanceCacheCutover;
};

const defaultExecutePooledRevertTrialExpiryDependencies: ExecutePooledRevertTrialExpiryDependencies =
	{
		withCustomerBalanceSyncLock,
		updateRevertTrialStatuses,
		executePooledBalanceOps,
		applyPooledBalanceCacheCutover: applyPreparedPooledBalanceCacheCutover,
	};

export const executePooledRevertTrialExpiryWithDependencies = async ({
	ctx,
	customerId,
	internalCustomerId,
	trialCustomerProductId,
	previousCustomerProductId,
	now,
	pooledBalanceOps,
	dependencies = defaultExecutePooledRevertTrialExpiryDependencies,
}: {
	ctx: AutumnContext;
	customerId: string;
	internalCustomerId: string;
	trialCustomerProductId: string;
	previousCustomerProductId: string;
	now: number;
	pooledBalanceOps: NonNullable<AutumnBillingPlan["pooledBalanceOps"]>;
	dependencies?: ExecutePooledRevertTrialExpiryDependencies;
}): Promise<boolean> => {
	const { restored, preparedCutover } =
		await dependencies.withCustomerBalanceSyncLock({
			ctx,
			customerId,
			internalCustomerId,
			callback: async ({ db }) => {
				const restored = await dependencies.updateRevertTrialStatuses({
					db,
					trialCustomerProductId,
					previousCustomerProductId,
					now,
				});
				if (!restored) return { restored, preparedCutover: undefined };

				const preparedCutover = await dependencies.executePooledBalanceOps({
					ctx: { ...ctx, db },
					customerId,
					pooledBalanceOps,
					balanceSyncDb: db,
				});
				return { restored, preparedCutover };
			},
		});

	if (preparedCutover) {
		await dependencies.applyPooledBalanceCacheCutover({
			ctx,
			prepared: preparedCutover,
		});
	}
	return restored;
};

export const computeRevertTrialExpiryPlan = ({
	fullCustomer,
	trialCustomerProduct,
	previousCustomerProduct,
	now,
}: {
	fullCustomer: FullCustomer;
	trialCustomerProduct: FullCusProduct;
	previousCustomerProduct: FullCusProduct;
	now: number;
}): AutumnBillingPlan => {
	if (previousCustomerProduct.status !== CusProductStatus.Paused) {
		return {
			customerId: fullCustomer.id ?? fullCustomer.internal_id,
			insertCustomerProducts: [],
			updateCustomerProducts: [
				{
					customerProduct: trialCustomerProduct,
					updates: { status: CusProductStatus.Expired },
				},
			],
			pooledBalanceOps: [],
		};
	}

	const pooledRestore = computeAttachPooledBalanceOps({
		customerProduct: {
			...previousCustomerProduct,
			status: CusProductStatus.Active,
		},
		attachBillingContext: {
			billingStartsAt: now,
			currentCustomerProduct: previousCustomerProduct,
			currentEpochMs: now,
			fullCustomer,
			planTiming: "immediate",
			skipBillingChanges: true,
		},
		removeCurrentSource: false,
	});

	return {
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		insertCustomerProducts: [],
		updateCustomerProducts: [
			{
				customerProduct: trialCustomerProduct,
				updates: { status: CusProductStatus.Expired },
			},
			{
				customerProduct: previousCustomerProduct,
				updates: { status: CusProductStatus.Active },
			},
		],
		pooledBalanceOps: pooledRestore.pooledBalanceOps,
	};
};

/**
 * Handles revert trial expiry inside a transaction: expire the trial
 * cusProduct and unpause the previous one atomically so we never leave a
 * customer without an active plan.
 *
 * Emits the `billing.updated` webhook (tag: `trial_ended`) describing both
 * the trial expiry and the restored previous plan.
 *
 * Returns true if handled, false to fall through to standard expiry.
 */
export const tryProcessRevertExpiry = async ({
	ctx,
	customerProduct,
	customerId,
}: {
	ctx: AutumnContext;
	customerProduct: InferSelectModel<typeof customerProducts>;
	customerId: string;
}): Promise<boolean> => {
	if (customerProduct.on_trial_end !== "revert") return false;

	const previousCusProductId = customerProduct.previous_customer_product_id;
	if (!previousCusProductId) {
		console.log(
			`[tryProcessRevertExpiry] No previous_customer_product_id on ${customerProduct.id}, falling back to standard expiry`,
		);
		return false;
	}

	// Snapshot fullCustomer BEFORE the transaction so the webhook payload
	// reflects pre-revert state in `previous_attributes`. RELEVANT_STATUSES
	// is broadened with Paused so the previous (paused) cusProduct is
	// visible — keeping the query narrow vs. ALL_STATUSES.
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
		withSubs: true,
		inStatuses: [...RELEVANT_STATUSES, CusProductStatus.Paused],
	});

	const trialFullCusProduct = fullCustomer.customer_products.find(
		(cp) => cp.id === customerProduct.id,
	);
	const previousFullCusProduct = fullCustomer.customer_products.find(
		(cp) => cp.id === previousCusProductId,
	);

	const now = Date.now();
	let autumnBillingPlan: AutumnBillingPlan | undefined;
	const updateStatusesInTransaction = () =>
		ctx.db.transaction(async (tx) => {
			await updateRevertTrialStatuses({
				db: tx as unknown as DrizzleCli,
				trialCustomerProductId: customerProduct.id,
				previousCustomerProductId: previousCusProductId,
				now,
			});
		});
	if (trialFullCusProduct && previousFullCusProduct) {
		autumnBillingPlan = computeRevertTrialExpiryPlan({
			fullCustomer,
			trialCustomerProduct: trialFullCusProduct,
			previousCustomerProduct: previousFullCusProduct,
			now,
		});
		if (autumnBillingPlan.pooledBalanceOps?.length) {
			const restored = await executePooledRevertTrialExpiryWithDependencies({
				ctx,
				customerId,
				internalCustomerId: fullCustomer.internal_id,
				trialCustomerProductId: customerProduct.id,
				previousCustomerProductId: previousCusProductId,
				now,
				pooledBalanceOps: autumnBillingPlan.pooledBalanceOps,
			});
			if (!restored) {
				autumnBillingPlan = {
					...autumnBillingPlan,
					updateCustomerProducts:
						autumnBillingPlan.updateCustomerProducts?.slice(0, 1),
					pooledBalanceOps: [],
				};
			}
		} else {
			await updateStatusesInTransaction();
		}
	} else {
		await updateStatusesInTransaction();
	}

	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "productCron:revert",
	});

	// Emit billing.updated webhook (fire-and-forget) describing both the
	// trial expiry and the restored previous plan. Skipped silently if we
	// couldn't resolve either snapshot.
	if (autumnBillingPlan) {
		void sendBillingUpdatedWebhook({
			ctx,
			autumnBillingPlan,
			originalFullCustomer: fullCustomer,
			tags: ["trial_ended"],
		});
	}

	return true;
};
