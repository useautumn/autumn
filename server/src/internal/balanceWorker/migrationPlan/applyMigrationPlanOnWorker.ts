import { parseApplyBillingPlanRequest } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import { throwOnSimulatedBalanceWorkerOutage } from "@/external/balanceWorker/simulateBalanceWorkerOutage.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { requestContextToCommandBase } from "@/internal/balances/balanceWorker/requestContextToCommandBase.js";
import {
	isDuplicateCommand,
	isStaleSubject,
	isUnknownOutcome,
} from "../billingPlan/planSendErrors.js";
import type { WorkerMigrationPlan } from "./types/workerMigrationPlan.js";

type PlanClient = Pick<BalanceWorkerClient, "applyBillingPlan">;

export type MigrationPlanOutcome = "applied" | "stale";

const sendPlan = async ({
	ctx,
	client,
	customerId,
	plan,
	commandId,
}: {
	ctx: AutumnContext;
	client: PlanClient;
	customerId: string;
	plan: WorkerMigrationPlan;
	commandId: string;
}): Promise<void> => {
	throwOnSimulatedBalanceWorkerOutage({ ctx });
	const request = parseApplyBillingPlanRequest({
		input: {
			command: {
				...requestContextToCommandBase({ ctx, customerId }),
				type: "applyBillingPlan",
				commandId,
				entityIds: plan.entityIds,
				ops: plan.ops,
			},
			catalogRows: plan.catalogRows,
		},
	});
	await client.applyBillingPlan({ request });
};

export const applyMigrationPlanOnWorker = async ({
	ctx,
	customerId,
	plan,
	commandId,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	customerId: string;
	plan: WorkerMigrationPlan;
	commandId: string;
	client?: PlanClient;
}): Promise<MigrationPlanOutcome> => {
	const send = () => sendPlan({ ctx, client, customerId, plan, commandId });
	try {
		await send().catch((cause: unknown) => {
			if (isUnknownOutcome(cause)) return send();
			throw cause;
		});
		return "applied";
	} catch (cause) {
		if (isDuplicateCommand(cause)) return "applied";
		if (isStaleSubject(cause)) return "stale";
		throw cause;
	}
};
