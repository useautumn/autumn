import type { WorkerFullSubject } from "@autumn/balance-engine";

/** The same rows read as the customer's: what a customer-scope alert measures on an entity track. */
export const entitySubjectToCustomerSubject = ({
	fullSubject,
}: {
	fullSubject: WorkerFullSubject;
}): WorkerFullSubject => ({
	...fullSubject,
	identity: { ...fullSubject.identity, entityId: null },
	entity: null,
});
