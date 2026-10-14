import { customerEntitlements } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";
import { resetCronQueryTag } from "../resetCronQueryTag.js";
import type { ResetMutation } from "../types.js";

const RESET_MUTATION_STATEMENT_TIMEOUT_MS = 2_000;

const updateCustomerEntitlements = async ({
	db,
	resetMutations,
}: {
	db: DrizzleCli;
	resetMutations: ResetMutation[];
}): Promise<Set<string>> => {
	const updates = resetMutations.map(
		({ customerEntitlementId, expectedNextResetAt, updates }) => ({
			id: customerEntitlementId,
			expected_next_reset_at: expectedNextResetAt,
			...updates,
		}),
	);

	const appliedRows = await db.execute<{ id: string }>(sql`
		UPDATE ${customerEntitlements} AS customer_entitlement
		SET
			balance = COALESCE(reset_update.balance, customer_entitlement.balance),
			additional_balance = COALESCE(
				reset_update.additional_balance,
				customer_entitlement.additional_balance
			),
			adjustment = reset_update.adjustment,
			entities = COALESCE(reset_update.entities, customer_entitlement.entities),
			usage_attribution = COALESCE(
				NULLIF(reset_update.usage_attribution, 'null'::jsonb),
				'{}'::jsonb
			),
			next_reset_at = reset_update.next_reset_at,
			cache_version = COALESCE(customer_entitlement.cache_version, 0) + 1
		FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS reset_update(
			id text,
			expected_next_reset_at numeric,
			balance numeric,
			additional_balance numeric,
			adjustment numeric,
			entities jsonb,
			usage_attribution jsonb,
			next_reset_at numeric
		)
		WHERE customer_entitlement.id = reset_update.id
			AND customer_entitlement.next_reset_at = reset_update.expected_next_reset_at
		RETURNING customer_entitlement.id
		${resetCronQueryTag("updateBalances")}
	`);

	return new Set(appliedRows.map((row) => row.id));
};

export const executeResetMutations = async ({
	db,
	resetMutations,
}: {
	db: DrizzleCli;
	resetMutations: ResetMutation[];
}): Promise<{
	appliedCustomerEntitlementIds: Set<string>;
	staleSkippedCount: number;
}> => {
	if (resetMutations.length === 0) {
		return { appliedCustomerEntitlementIds: new Set(), staleSkippedCount: 0 };
	}

	let appliedCustomerEntitlementIds = new Set<string>();

	await withStatementTimeout(
		db,
		async (transaction) => {
			appliedCustomerEntitlementIds = await updateCustomerEntitlements({
				db: transaction,
				resetMutations,
			});

			const appliedMutations = resetMutations.filter(
				({ customerEntitlementId }) =>
					appliedCustomerEntitlementIds.has(customerEntitlementId),
			);

			const rolloverWrites = appliedMutations.flatMap(
				({ rolloverInserts, rolloverUpdates }) => [
					...rolloverInserts,
					...rolloverUpdates,
				],
			);
			const rolloverDeleteIds = appliedMutations.flatMap(
				({ rolloverDeleteIds }) => rolloverDeleteIds,
			);

			await RolloverService.upsert({
				db: transaction,
				rows: rolloverWrites,
				queryTag: resetCronQueryTag("upsertRollovers"),
			});
			await RolloverService.delete({
				db: transaction,
				ids: rolloverDeleteIds,
				queryTag: resetCronQueryTag("deleteRollovers"),
			});
		},
		RESET_MUTATION_STATEMENT_TIMEOUT_MS,
	);

	return {
		appliedCustomerEntitlementIds,
		staleSkippedCount:
			resetMutations.length - appliedCustomerEntitlementIds.size,
	};
};
