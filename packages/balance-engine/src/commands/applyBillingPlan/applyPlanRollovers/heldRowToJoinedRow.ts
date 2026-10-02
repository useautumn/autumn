import { StaleMutationError } from "../../../errors.js";
import type { Catalog } from "../../../models/catalog/catalog.js";
import type { WorkerEntity } from "../../../models/subject/rows/workerEntity.js";
import type { SubjectState } from "../../../models/subject/subjectState.js";
import type { WorkerFullCustomerEntitlementWithProduct } from "../../../models/subject/workerFullSubject.js";
import { fullSubjectToHeldRows } from "../../../utils/subjectUtils/convertSubjectUtils.js";
import { heldRowToFullSubject } from "../../common/heldRowToFullSubject.js";

/** A held grant joined to its catalog and product, as the rollover cap reads it. */
export const heldRowToJoinedRow = ({
	id,
	state,
	entities,
	catalog,
}: {
	id: string;
	state: SubjectState;
	entities: readonly WorkerEntity[];
	catalog: Catalog;
}): WorkerFullCustomerEntitlementWithProduct => {
	const fullSubject = heldRowToFullSubject({ id, state, entities, catalog });
	const row = fullSubjectToHeldRows({ fullSubject }).find(
		(held) => held.id === id,
	);
	if (!row) throw new StaleMutationError({ subject: id });
	return row;
};
