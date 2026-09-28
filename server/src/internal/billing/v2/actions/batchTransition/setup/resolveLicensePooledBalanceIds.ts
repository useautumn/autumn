import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeLicensePooledBalancePlan } from "@/internal/billing/v2/pooledBalances/compute/computeLicensePooledBalancePlan";
import { executePooledBalancePlan } from "@/internal/billing/v2/pooledBalances/execute/executePooledBalancePlan";
import {
	findLicensePooledBalanceId,
	type LicensePooledBalanceMatch,
} from "../execute/sql/findLicensePooledBalanceId";
import type {
	AddEntitlementPriceOperation,
	EntitlementPriceOperation,
	PooledAddSpec,
} from "../types/entitlementPriceOperationTypes";
import type { BatchTransitionContext } from "../types/types";

type PooledAddOperation = AddEntitlementPriceOperation & {
	pooledAdd: PooledAddSpec;
};

const isPooledAddOperation = (
	operation: EntitlementPriceOperation,
): operation is PooledAddOperation =>
	operation.type === "add" && operation.pooledAdd !== undefined;

const findMatches = ({
	ctx,
	operations,
	now,
}: {
	ctx: AutumnContext;
	operations: PooledAddOperation[];
	now: number;
}): Promise<(LicensePooledBalanceMatch | undefined)[]> =>
	Promise.all(
		operations.map((operation) =>
			findLicensePooledBalanceId({
				db: ctx.db,
				identity: operation.pooledAdd.identity,
				now,
			}),
		),
	);

/** Stamps each pooled add with its license pool. Billing creates pools; if one
 * is missing, re-run billing's own license pool step rather than guess. */
export const resolveLicensePooledBalanceIds = async ({
	ctx,
	batchTransitionContext,
	operations,
}: {
	ctx: AutumnContext;
	batchTransitionContext: BatchTransitionContext;
	operations: EntitlementPriceOperation[];
}) => {
	const pooledAddOperations = operations.filter(isPooledAddOperation);
	if (pooledAddOperations.length === 0) return;

	const now = Date.now();
	let matches = await findMatches({
		ctx,
		operations: pooledAddOperations,
		now,
	});

	if (matches.some((match) => !match?.isExactMatch)) {
		const pooledBalancePlan = computeLicensePooledBalancePlan({
			ctx,
			fullCustomer: batchTransitionContext.fullCustomer,
			parentCustomerProduct: batchTransitionContext.parentCustomerProduct,
			now,
		});
		ctx.logger.warn(
			"[batchTransition] license pool missing before seat transition; re-ran billing's license pool step",
			{
				data: {
					customerLicenseLinkIds: pooledAddOperations.map(
						(operation) => operation.pooledAdd.identity.customerLicenseLinkId,
					),
					hasPooledBalancePlan: pooledBalancePlan !== undefined,
				},
			},
		);
		await executePooledBalancePlan({ ctx, pooledBalancePlan });
		matches = await findMatches({
			ctx,
			operations: pooledAddOperations,
			now,
		});
	}

	pooledAddOperations.forEach((operation, index) => {
		const match = matches[index];
		// Billing's step just ran, so no exact pool means the license no longer
		// grants this item (a newer plan change won): skip the stale add.
		if (!match?.isExactMatch) {
			ctx.logger.warn(
				"[batchTransition] skipping stale pooled seat addition — no exact license pool",
				{
					data: {
						customerLicenseLinkId:
							operation.pooledAdd.identity.customerLicenseLinkId,
						internalFeatureId: operation.pooledAdd.identity.internalFeatureId,
						nearestPooledBalanceId: match?.pooledBalanceId ?? null,
					},
				},
			);
		}
		operation.pooledAdd.pooledBalanceId = match?.isExactMatch
			? match.pooledBalanceId
			: undefined;
	});
};
