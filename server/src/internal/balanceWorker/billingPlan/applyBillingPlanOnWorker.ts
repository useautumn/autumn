import {
	type ApplyBillingPlanRequest,
	type BillingPlanOp,
	parseApplyBillingPlanRequest,
} from "@autumn/balance-engine";
import {
	type ApplyBillingPlanReply,
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import {
	type AutumnBillingPlan,
	EntityAlreadyExistsError,
} from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import { throwOnSimulatedBalanceWorkerOutage } from "@/external/balanceWorker/simulateBalanceWorkerOutage.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { requestContextToCommandBase } from "@/internal/balances/balanceWorker/requestContextToCommandBase.js";
import type { AutumnBillingPlanResult } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { generateId } from "@/utils/genUtils.js";
import { autumnBillingPlanToCatalogRows } from "./autumnBillingPlanToCatalogRows.js";
import { autumnBillingPlanToPlanOps } from "./planOps/autumnBillingPlanToPlanOps.js";
import { billingPlanToWorkerEntityIds } from "./routing/billingPlanToWorkerEntityIds.js";

type PlanClient = Pick<BalanceWorkerClient, "applyBillingPlan">;

const isUnknownOutcome = (cause: unknown): boolean =>
	cause instanceof BalanceWorkerClientError && cause.outcome === "unknown";

const isStaleSubject = (cause: unknown): boolean =>
	cause instanceof BalanceWorkerClientError &&
	cause.workerCode === "STALE_SUBJECT";

const isDuplicateCommand = (cause: unknown): boolean =>
	cause instanceof BalanceWorkerClientError &&
	cause.workerCode === "DUPLICATE_COMMAND";

const sendPlan = async ({
	ctx,
	client,
	customerId,
	autumnBillingPlan,
	ops,
	commandId,
}: {
	ctx: AutumnContext;
	client: PlanClient;
	customerId: string;
	autumnBillingPlan: AutumnBillingPlan;
	ops: BillingPlanOp[];
	commandId: string;
}): Promise<ApplyBillingPlanReply> => {
	throwOnSimulatedBalanceWorkerOutage({ ctx });
	const request: ApplyBillingPlanRequest = parseApplyBillingPlanRequest({
		input: {
			command: {
				...requestContextToCommandBase({ ctx, customerId }),
				type: "applyBillingPlan",
				commandId,
				entityIds: billingPlanToWorkerEntityIds({ autumnBillingPlan }),
				ops,
			},
			catalogRows: autumnBillingPlanToCatalogRows({ autumnBillingPlan }),
		},
	});
	return client.applyBillingPlan({ request });
};

const replyToResult = ({
	reply,
	autumnBillingPlan,
}: {
	reply: ApplyBillingPlanReply;
	autumnBillingPlan: AutumnBillingPlan;
}): AutumnBillingPlanResult => {
	const internalCustomerId = reply.state.customer.internal_id;
	if (reply.result.status === "entity_exists") {
		const { entity } = reply.result;
		const createdByThisPlan = (autumnBillingPlan.insertEntities ?? []).some(
			({ internal_id }) => internal_id === entity.internal_id,
		);
		if (!createdByThisPlan)
			throw new EntityAlreadyExistsError({ entityId: entity.id });
		return { status: "applied", internalCustomerId };
	}
	const createdByThisPlan =
		autumnBillingPlan.insertCustomer?.internal_id === internalCustomerId;
	const status = createdByThisPlan ? "applied" : reply.result.status;
	return { status, internalCustomerId };
};

export const applyBillingPlanOnWorker = async ({
	ctx,
	customerId,
	autumnBillingPlan,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	customerId: string;
	autumnBillingPlan: AutumnBillingPlan;
	client?: PlanClient;
}): Promise<AutumnBillingPlanResult> => {
	const ops = autumnBillingPlanToPlanOps({ autumnBillingPlan });
	if (ops.length === 0) return { status: "applied" };

	const createsCustomer = Boolean(autumnBillingPlan.insertCustomer);
	const send = ({ commandId }: { commandId: string }) =>
		sendPlan({ ctx, client, customerId, autumnBillingPlan, ops, commandId });
	const commandId = generateId("plan");
	try {
		const reply = await send({ commandId }).catch((cause: unknown) => {
			if (isUnknownOutcome(cause)) return send({ commandId });
			if (!createsCustomer && isStaleSubject(cause))
				return send({ commandId: generateId("plan") });
			throw cause;
		});
		return replyToResult({ reply, autumnBillingPlan });
	} catch (cause) {
		if (createsCustomer && isStaleSubject(cause))
			return { status: "customer_exists" };
		if (isDuplicateCommand(cause)) return { status: "applied" };
		rethrowBalanceWorkerError({ cause });
	}
};
