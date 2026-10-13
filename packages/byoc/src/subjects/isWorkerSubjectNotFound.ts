import { BalanceWorkerClientError } from "@autumn/balance-worker-client";

/** The worker's word that the customer or entity does not exist, rather than a failure to answer. */
export const isWorkerSubjectNotFound = ({
	error,
}: {
	error: unknown;
}): boolean =>
	error instanceof BalanceWorkerClientError &&
	(error.workerCode === "CUSTOMER_NOT_FOUND" ||
		error.workerCode === "ENTITY_NOT_FOUND");
