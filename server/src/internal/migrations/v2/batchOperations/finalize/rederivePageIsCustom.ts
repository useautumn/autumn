import { MigrationItemRunSkipReason, withTimeout } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type IsCustomDerivationCache,
	rederiveIsCustomForCustomers,
} from "@/internal/customers/cusProducts/actions/deriveIsCustom/rederiveIsCustomForCustomers.js";
import type {
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
} from "../execute/types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_IS_CUSTOM_REPAIR_TIMEOUT_MS } from "../execute/utils/batchMigrationExecutionConstants.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";

const planInternalProductIds = ({
	plan,
}: {
	plan: BatchMigrationExecutionPlan;
}) => [
	...new Set(
		plan.patches.flatMap((patch) => [
			patch.fromProduct.internal_id,
			...(patch.toProduct ? [patch.toProduct.internal_id] : []),
		]),
	),
];

/** Changed customers, plus converged ones: a retry reports a customer an interrupted attempt changed as converged. */
const customersToRederive = ({
	pageResult,
}: {
	pageResult: BatchMigrationPageResult;
}): BatchMigrationPageCustomer[] => [
	...pageResult.succeeded,
	...pageResult.skipped.filter(
		(customer) =>
			pageResult.skipReasons?.[customer.internalId] ===
			MigrationItemRunSkipReason.NoUpdatesNeeded,
	),
];

/** Batch ops bypass the billing-plan hook, so each page re-derives `is_custom` before its caches
 * drop and one invalidation covers both. Returns the customers whose flag may have changed; never throws. */
export const rederivePageIsCustom = async ({
	ctx,
	migrationRunId,
	plan,
	pageResult,
	cache,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	pageResult: BatchMigrationPageResult;
	cache: IsCustomDerivationCache;
}): Promise<BatchMigrationPageCustomer[]> => {
	const customers = customersToRederive({ pageResult });
	if (customers.length === 0) return [];

	try {
		const { changedCustomers } = await withTimeout({
			timeoutMs: BATCH_MIGRATION_IS_CUSTOM_REPAIR_TIMEOUT_MS,
			fn: () =>
				rederiveIsCustomForCustomers({
					ctx,
					internalCustomerIds: customers.map(({ internalId }) => internalId),
					internalProductIds: planInternalProductIds({ plan }),
					cache,
				}),
			timeoutMessage: `is_custom re-derivation exceeded ${BATCH_MIGRATION_IS_CUSTOM_REPAIR_TIMEOUT_MS}ms`,
		});
		const changedIds = new Set(
			changedCustomers.map(({ internalId }) => internalId),
		);
		return customers.filter(({ internalId }) => changedIds.has(internalId));
	} catch (error) {
		ctx.logger.error("batch-migration: is_custom re-derivation failed", {
			error,
			data: { migrationRunId, customers: customers.length },
		});
		// Some flags may have been written before the failure, so every cache is treated as stale.
		return customers;
	}
};
