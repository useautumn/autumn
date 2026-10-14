import type { WorkerFullSubject } from "@autumn/balance-engine";

export const entitySubjectToCustomerSubject = ({
	fullSubject,
}: {
	fullSubject: WorkerFullSubject;
}): WorkerFullSubject =>
	fullSubject.entity === null && fullSubject.identity.entityId === null
		? fullSubject
		: {
				...fullSubject,
				identity: { ...fullSubject.identity, entityId: null },
				entity: null,
			};
