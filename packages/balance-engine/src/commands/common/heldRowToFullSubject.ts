import { StaleMutationError } from "../../errors.js";
import type { Catalog } from "../../models/catalog/catalog.js";
import type { WorkerEntity } from "../../models/subject/rows/workerEntity.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { grantOwnerOf } from "../../utils/subjectStateUtils/convertSubjectStateUtils.js";
import { subjectStateToFullSubject } from "../../utils/subjectUtils/convertSubjectUtils.js";

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

export const heldRowToFullSubject = ({
	id,
	state,
	entities,
	catalog,
}: {
	id: string;
	state: SubjectState;
	entities: readonly WorkerEntity[];
	catalog: Catalog;
}): WorkerFullSubject => {
	const heldRow = state.customerEntitlements.find((row) => row.id === id);
	if (!heldRow) throw new StaleMutationError({ subject: id });
	const entity = ownerEntityOf({ state, entities, row: heldRow });
	return subjectStateToFullSubject({
		state: entity ? { ...state, entity } : state,
		catalog,
		entityId: entity?.id ?? null,
	});
};
