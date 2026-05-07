import type { Migration, Operations } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { PreparedState } from "@/internal/migrations/v2/prepare/types/index.js";
import { recordMigrationCustomerEvent } from "../events/index.js";
import {
	type RunOpsForCustomerResult,
	runOpsForCustomer,
} from "./runOpsForCustomer.js";

/** Runs one customer and records its lifecycle events. */
export const runCustomerMigration = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	scope_id,
	operations,
	prepared_state,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	dryRun: boolean;
	scope_id: string;
	operations: Operations;
	prepared_state: PreparedState;
	internalCustomerId: string;
}): Promise<RunOpsForCustomerResult> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: internalCustomerId,
	});

	await recordMigrationCustomerEvent({
		ctx,
		migration,
		migrationRunId,
		dryRun,
		eventType: "customer_started",
		internalCustomerId: fullCustomer.internal_id,
		customerId: fullCustomer.id,
		details: { beforeCustomer: fullCustomer },
	});

	const result = await runOpsForCustomer({
		ctx,
		scopeId: scope_id,
		fullCustomer,
		operations,
		preparedState: prepared_state,
		dryRun,
	});

	const eventType =
		result.matched_cusproducts === 0
			? "customer_skipped"
			: "customer_succeeded";

	await recordMigrationCustomerEvent({
		ctx,
		migration,
		migrationRunId,
		dryRun,
		eventType,
		internalCustomerId: fullCustomer.internal_id,
		customerId: fullCustomer.id,
		details: {
			matchedCustomerProducts: result.matched_cusproducts,
			upsertItems: result.upsert_items,
		},
	});

	return result;
};
