import { BalanceWorkerClientError } from "@autumn/balance-worker-client";

export const isWorkerSubjectNotFound = ({
	error,
}: {
	error: unknown;
}): boolean =>
	error instanceof BalanceWorkerClientError &&
	(error.workerCode === "CUSTOMER_NOT_FOUND" ||
		error.workerCode === "ENTITY_NOT_FOUND");
