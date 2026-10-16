import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import type { BatchMigrationPageCustomer } from "../types/batchMigrationExecutionTypes.js";
import type { RoutedPageCustomer } from "./types/routedPageCustomer.js";

const toRoutedCustomer = ({
	ctx,
	customer,
}: {
	ctx: Pick<AutumnContext, "org">;
	customer: BatchMigrationPageCustomer;
}): RoutedPageCustomer | null => {
	const { id } = customer;
	if (id === null) return null;
	if (!isBalanceWorkerRolloutEnabled({ ctx, customerId: id })) return null;
	return { ...customer, id };
};

export const splitPageByRouting = ({
	ctx,
	customers,
}: {
	ctx: Pick<AutumnContext, "org">;
	customers: BatchMigrationPageCustomer[];
}): {
	worker: RoutedPageCustomer[];
	sql: BatchMigrationPageCustomer[];
} => {
	const worker: RoutedPageCustomer[] = [];
	const sql: BatchMigrationPageCustomer[] = [];
	for (const customer of customers) {
		const routed = toRoutedCustomer({ ctx, customer });
		if (routed) worker.push(routed);
		else sql.push(customer);
	}
	return { worker, sql };
};
