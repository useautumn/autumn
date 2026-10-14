import { MigrationItemRunSkipReason } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type IsCustomDerivationCache,
	rederiveIsCustomForCustomers,
} from "@/internal/customers/cusProducts/actions/deriveIsCustom/rederiveIsCustomForCustomers.js";
import type {
	BatchMigrationPageCustomer,
	BatchMigrationPageResult,
} from "../execute/types/batchMigrationExecutionTypes.js";
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
		const { changedCustomers } = await rederiveIsCustomForCustomers({
			ctx,
			internalCustomerIds: customers.map(({ internalId }) => internalId),
			internalProductIds: planInternalProductIds({ plan }),
			cache,
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
		return customers;
	}
};
