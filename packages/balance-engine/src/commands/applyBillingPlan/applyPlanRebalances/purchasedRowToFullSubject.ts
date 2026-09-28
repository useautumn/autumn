import { StaleMutationError } from "../../../errors.js";
import type { Catalog } from "../../../models/catalog/catalog.js";
import type { WorkerEntity } from "../../../models/subject/rows/workerEntity.js";
import type { SubjectState } from "../../../models/subject/subjectState.js";
import type { WorkerFullSubject } from "../../../models/subject/workerFullSubject.js";
import { grantOwnerOf } from "../../../utils/subjectStateUtils/convertSubjectStateUtils.js";
import { subjectStateToFullSubject } from "../../../utils/subjectUtils/convertSubjectUtils.js";
import type { BillingPlanRebalanceOp } from "../types/billingPlanOp.js";

/** The entity that owns the row, or null for a customer-level row. */
const ownerEntityOf = ({
	state,
	entities,
	row,
}: {
	state: SubjectState;
	entities: readonly WorkerEntity[];
	row: SubjectState["customerEntitlements"][number];
}): WorkerEntity | null => {
	const internalEntityId = grantOwnerOf({ state, row });
	if (!internalEntityId) return null;
	const entity = entities.find(
		({ internal_id }) => internal_id === internalEntityId,
	);
	if (!entity?.id) throw new StaleMutationError({ subject: row.id });
	return entity;
};

/** The customer or entity that owns the purchased row, as it stands; a row the worker does not hold means its copy is behind. */
export const purchasedRowToFullSubject = ({
	op,
	state,
	entities,
	catalog,
}: {
	op: BillingPlanRebalanceOp;
	state: SubjectState;
	entities: readonly WorkerEntity[];
	catalog: Catalog;
}): WorkerFullSubject => {
	const purchasedRow = state.customerEntitlements.find(
		({ id }) => id === op.id,
	);
	if (!purchasedRow) throw new StaleMutationError({ subject: op.id });
	// The plan's state is the customer's merged with its named entities: an entity's view needs that entity set on it.
	const entity = ownerEntityOf({ state, entities, row: purchasedRow });
	return subjectStateToFullSubject({
		state: entity ? { ...state, entity } : state,
		catalog,
		entityId: entity?.id ?? null,
	});
};
