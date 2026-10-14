import type { MutationSubject } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";

export const fullSubjectToMutationSubject = ({
	fullSubject,
}: {
	fullSubject: WorkerFullSubject;
}): MutationSubject => ({
	internalCustomerId: fullSubject.customer.internal_id,
	internalEntityId: fullSubject.entity?.internal_id ?? null,
});
