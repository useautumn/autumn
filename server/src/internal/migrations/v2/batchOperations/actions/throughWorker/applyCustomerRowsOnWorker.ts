import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerUnconfirmed } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { isTransientRefusal } from "@/internal/balanceWorker/billingPlan/planSendErrors.js";
import {
	applyMigrationPlanOnWorker,
	type MigrationPlanOutcome,
} from "@/internal/balanceWorker/migrationPlan/applyMigrationPlanOnWorker.js";
import type { WorkerMigrationPlan } from "@/internal/balanceWorker/migrationPlan/types/workerMigrationPlan.js";
import { BATCH_MIGRATION_WORKER_TRANSIENT_RETRY_DELAYS_MS } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { generateId, timeout } from "@/utils/genUtils.js";
import type { WorkerPageCustomer } from "./types/workerPageCustomer.js";

type CustomerRowsOutcome<Row> =
	| { status: "applied"; rows: Row[] }
	| { status: "failed"; reason: string; unavailable: boolean };

const failed = ({
	reason,
	unavailable = false,
}: {
	reason: string;
	unavailable?: boolean;
}): CustomerRowsOutcome<never> => ({ status: "failed", reason, unavailable });

const sendThroughTransientRefusals = async ({
	signal,
	retryDelaysMs,
	send,
}: {
	signal: AbortSignal;
	retryDelaysMs: number[];
	send: () => Promise<MigrationPlanOutcome>;
}): Promise<MigrationPlanOutcome> => {
	for (let attempt = 0; ; attempt++) {
		signal.throwIfAborted();
		try {
			return await send();
		} catch (error) {
			const delayMs = retryDelaysMs[attempt];
			if (!isTransientRefusal(error) || delayMs === undefined) throw error;
			await timeout(delayMs);
		}
	}
};

/** Stale once re-selects and resends; anything the worker can't apply fails the customer for a retry run. */
export const applyCustomerRowsOnWorker = async <Row>({
	ctx,
	customer,
	rows,
	toPlan,
	reselect,
	signal,
	retryDelaysMs = BATCH_MIGRATION_WORKER_TRANSIENT_RETRY_DELAYS_MS,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	customer: WorkerPageCustomer;
	rows: Row[];
	toPlan: ({ rows }: { rows: Row[] }) => WorkerMigrationPlan;
	reselect: () => Promise<Row[] | null>;
	signal: AbortSignal;
	retryDelaysMs?: number[];
	client?: Pick<BalanceWorkerClient, "applyBillingPlan">;
}): Promise<CustomerRowsOutcome<Row>> => {
	const send = ({ sentRows }: { sentRows: Row[] }) =>
		sendThroughTransientRefusals({
			signal,
			retryDelaysMs,
			send: () =>
				applyMigrationPlanOnWorker({
					ctx,
					customerId: customer.id,
					plan: toPlan({ rows: sentRows }),
					commandId: generateId("mig"),
					signal,
					client,
				}),
		});

	try {
		if ((await send({ sentRows: rows })) === "applied")
			return { status: "applied", rows };

		const freshRows = await reselect();
		if (freshRows === null) return failed({ reason: "UNHELD_ROWS" });
		if (freshRows.length === 0) return { status: "applied", rows: [] };

		if ((await send({ sentRows: freshRows })) === "applied")
			return { status: "applied", rows: freshRows };
		return failed({ reason: "STALE_SUBJECT" });
	} catch (error) {
		signal.throwIfAborted();
		if (!(error instanceof BalanceWorkerClientError)) throw error;
		return failed({
			reason: error.workerCode ?? error.code,
			unavailable:
				isBalanceWorkerUnconfirmed(error) || isTransientRefusal(error),
		});
	}
};
