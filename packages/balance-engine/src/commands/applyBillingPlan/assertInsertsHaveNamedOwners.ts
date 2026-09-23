import { UnsupportedCommandError } from "../../errors.js";
import type { WorkerEntity } from "../../models/subject/rows/workerEntity.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import type { ApplyBillingPlanCommand } from "./types/applyBillingPlanCommand.js";
import type { BillingPlanOp } from "./types/billingPlanOp.js";

type InsertOp = Extract<BillingPlanOp, { op: "insert" }>;

const idsOf = (rows: readonly { id: string }[]): Set<string> =>
	new Set(rows.map(({ id }) => id));

/** A row lands on the customer or an entity the plan names; any other row would vanish when the view is split back per owner. */
export const assertInsertsHaveNamedOwners = ({
	command,
	state,
	entities,
}: {
	command: ApplyBillingPlanCommand;
	state: SubjectState | null;
	/** Every entity the plan names, the ones it creates included. */
	entities: readonly WorkerEntity[];
}): void => {
	const inserts = command.ops.filter(
		(op): op is InsertOp => op.op === "insert",
	);
	const insertedRows = (table: InsertOp["table"]) =>
		inserts.flatMap((op) => (op.table === table ? [op.row] : []));
	const ownerIds = new Set<string | null>([
		null,
		...entities.map((entity) => entity.internal_id),
	]);
	const productIds = idsOf([
		...(state?.customerProducts ?? []),
		...insertedRows("customerProducts").map((row) => ({ id: String(row.id) })),
	]);
	const entitlementIds = idsOf([
		...(state?.customerEntitlements ?? []),
		...insertedRows("customerEntitlements").map((row) => ({
			id: String(row.id),
		})),
	]);

	const hasNamedOwner = (op: InsertOp): boolean => {
		switch (op.table) {
			case "customer":
				return true;
			case "entity":
				return ownerIds.has(op.row.internal_id);
			case "customerProducts":
			case "customerEntitlements":
				return ownerIds.has(op.row.internal_entity_id ?? null);
			case "customerPrices":
				return productIds.has(op.row.customer_product_id);
			case "rollovers":
				return entitlementIds.has(op.row.cus_ent_id);
		}
	};
	if (!inserts.every(hasNamedOwner))
		throw new UnsupportedCommandError({
			reason: "billing_plan_row_owner_not_named",
		});
};
