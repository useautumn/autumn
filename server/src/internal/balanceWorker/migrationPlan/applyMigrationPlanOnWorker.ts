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
	signal,
}: {
	ctx: AutumnContext;
	client: PlanClient;
	customerId: string;
	plan: WorkerMigrationPlan;
	commandId: string;
	signal?: AbortSignal;
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
	await client.applyBillingPlan({ request, signal });
};

export const applyMigrationPlanOnWorker = async ({
	ctx,
	customerId,
	plan,
	commandId,
	signal,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	customerId: string;
	plan: WorkerMigrationPlan;
	commandId: string;
	signal?: AbortSignal;
	client?: PlanClient;
}): Promise<MigrationPlanOutcome> => {
	const send = () =>
		sendPlan({ ctx, client, customerId, plan, commandId, signal });
	try {
		await send();
		return "applied";
	} catch (cause) {
		if (isStaleSubject(cause)) return "stale";
		if (!isUnknownOutcome(cause)) throw cause;
		signal?.throwIfAborted();
		return resendUnknownOutcome({ send, unknownOutcome: cause });
	}
};

/** Same id, so a landed first send reads as DUPLICATE; any other refusal keeps the outcome unknown. */
const resendUnknownOutcome = async ({
	send,
	unknownOutcome,
}: {
	send: () => Promise<void>;
	unknownOutcome: unknown;
}): Promise<MigrationPlanOutcome> => {
	try {
		await send();
		return "applied";
	} catch (cause) {
		if (isDuplicateCommand(cause)) return "applied";
		if (isStaleSubject(cause)) return "stale";
		throw unknownOutcome;
	}
};
