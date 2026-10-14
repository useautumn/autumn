import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findLicensePooledBalanceId } from "../execute/sql/findLicensePooledBalanceId";
import type {
	AddEntitlementPriceOperation,
	EntitlementPriceOperation,
	PooledAddSpec,
} from "../types/entitlementPriceOperationTypes";

type PooledAddOperation = AddEntitlementPriceOperation & {
	pooledAdd: PooledAddSpec;
};

const isPooledAddOperation = (
	operation: EntitlementPriceOperation,
): operation is PooledAddOperation =>
	operation.type === "add" && operation.pooledAdd !== undefined;

export const resolveLicensePooledBalanceIds = async ({
	ctx,
	operations,
}: {
	ctx: AutumnContext;
	operations: EntitlementPriceOperation[];
}) => {
	const pooledAddOperations = operations.filter(isPooledAddOperation);
	if (pooledAddOperations.length === 0) return;

	const now = Date.now();
	for (const operation of pooledAddOperations) {
		const { identity } = operation.pooledAdd;
		const match = await findLicensePooledBalanceId({
			db: ctx.db,
			identity,
			now,
		});

		if (!match?.isExactMatch) {
			ctx.logger.warn(
				"[batchTransition] skipping stale pooled seat addition — no exact license pool",
				{
					data: {
						customerLicenseLinkId: identity.customerLicenseLinkId,
						internalFeatureId: identity.internalFeatureId,
						nearestPooledBalanceId: match?.pooledBalanceId ?? null,
					},
				},
			);
		}
		operation.pooledAdd.pooledBalanceId = match?.isExactMatch
			? match.pooledBalanceId
			: undefined;
	}
};
