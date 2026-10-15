import {
	emptyWorkerPhaseResult,
	type WorkerPhaseResult,
} from "../../actions/throughWorker/types/workerPhaseResult.js";
import type { RoutedPageCustomer } from "../routing/types/routedPageCustomer.js";

// Review-cut glue for #4846: a phase not yet wired to the worker sends every
// routed customer down the SQL fallback, which writes them in SQL and evicts.
export const fallBackAllWorkerCustomers = async ({
	customers,
}: {
	customers: RoutedPageCustomer[];
}): Promise<WorkerPhaseResult> => ({
	...emptyWorkerPhaseResult(),
	fallbackInternalCustomerIds: customers.map(({ internalId }) => internalId),
});
