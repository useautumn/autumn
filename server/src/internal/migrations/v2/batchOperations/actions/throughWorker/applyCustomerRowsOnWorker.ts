import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerUnconfirmed } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { applyMigrationPlanOnWorker } from "@/internal/balanceWorker/migrationPlan/applyMigrationPlanOnWorker.js";
import type { WorkerMigrationPlan } from "@/internal/balanceWorker/migrationPlan/types/workerMigrationPlan.js";
import type { RoutedPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/routing/types/routedPageCustomer.js";
import { generateId } from "@/utils/genUtils.js";

export type CustomerRowsOutcome<Row> =
	| { status: "applied"; rows: Row[] }
	| { status: "fallback"; reason: string }
	| { status: "failed"; reason: string; unavailable: boolean };

const failureOf = (
	error: BalanceWorkerClientError,
): CustomerRowsOutcome<never> => ({
	status: "failed",
	reason: error.workerCode ?? error.code,
	unavailable: isBalanceWorkerUnconfirmed(error),
});

export const applyCustomerRowsOnWorker = async <Row>({
	ctx,
	customer,
	rows,
	toPlan,
	reselect,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	customer: RoutedPageCustomer;
	rows: Row[];
	toPlan: ({ rows }: { rows: Row[] }) => WorkerMigrationPlan;
	reselect: () => Promise<Row[] | null>;
	client?: Pick<BalanceWorkerClient, "applyBillingPlan">;
}): Promise<CustomerRowsOutcome<Row>> => {
	const send = ({ sentRows }: { sentRows: Row[] }) =>
		applyMigrationPlanOnWorker({
			ctx,
			customerId: customer.id,
			plan: toPlan({ rows: sentRows }),
			commandId: generateId("mig"),
			client,
		});

	try {
		if ((await send({ sentRows: rows })) === "applied")
			return { status: "applied", rows };

		const freshRows = await reselect();
		if (freshRows === null)
			return { status: "fallback", reason: "UNHELD_ROWS" };
		if (freshRows.length === 0) return { status: "applied", rows: [] };

		if ((await send({ sentRows: freshRows })) === "applied")
			return { status: "applied", rows: freshRows };
		return { status: "fallback", reason: "STALE_SUBJECT" };
	} catch (error) {
		if (error instanceof BalanceWorkerClientError) return failureOf(error);
		throw error;
	}
};
