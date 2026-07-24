import { customerEntitlements } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";
import { resetCronQueryTag } from "../resetCronQueryTag.js";
import type { ResetMutation } from "../types.js";

const updateCustomerEntitlements = async ({
	db,
	resetMutations,
}: {
	db: DrizzleCli;
	resetMutations: ResetMutation[];
}) => {
	const updates = resetMutations.map(({ customerEntitlementId, updates }) => ({
		id: customerEntitlementId,
		...updates,
	}));

	await db.execute(sql`
		UPDATE ${customerEntitlements} AS customer_entitlement
		SET
			balance = COALESCE(reset_update.balance, customer_entitlement.balance),
			additional_balance = COALESCE(
				reset_update.additional_balance,
				customer_entitlement.additional_balance
			),
			adjustment = reset_update.adjustment,
			entities = COALESCE(reset_update.entities, customer_entitlement.entities),
			next_reset_at = reset_update.next_reset_at,
			cache_version = COALESCE(customer_entitlement.cache_version, 0) + 1
		FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS reset_update(
			id text,
			balance numeric,
			additional_balance numeric,
			adjustment numeric,
			entities jsonb,
			next_reset_at numeric
		)
		WHERE customer_entitlement.id = reset_update.id
		${resetCronQueryTag("updateBalances")}
	`);
};

export const executeResetMutations = async ({
	db,
	resetMutations,
}: {
	db: DrizzleCli;
	resetMutations: ResetMutation[];
}) => {
	if (resetMutations.length === 0) return;

	const rolloverWrites = resetMutations.flatMap(
		({ rolloverInserts, rolloverUpdates }) => [
			...rolloverInserts,
			...rolloverUpdates,
		],
	);
	const rolloverDeleteIds = resetMutations.flatMap(
		({ rolloverDeleteIds }) => rolloverDeleteIds,
	);

	await withStatementTimeout(db, async (transaction) => {
		await updateCustomerEntitlements({
			db: transaction,
			resetMutations,
		});
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
	});
};
