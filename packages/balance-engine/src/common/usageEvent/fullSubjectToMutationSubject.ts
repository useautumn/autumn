import type { MutationSubject } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";

/** Who a record is about, in internal ids: a reader of the log has no rows to resolve them from. */
export const fullSubjectToMutationSubject = ({
	fullSubject,
}: {
	fullSubject: WorkerFullSubject;
}): MutationSubject => ({
	internalCustomerId: fullSubject.customer.internal_id,
	internalEntityId: fullSubject.entity?.internal_id ?? null,
});
