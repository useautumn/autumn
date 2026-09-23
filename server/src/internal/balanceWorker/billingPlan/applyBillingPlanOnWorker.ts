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
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { requestContextToCommandBase } from "@/internal/balances/balanceWorker/requestContextToCommandBase.js";
import type { AutumnBillingPlanResult } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { generateId } from "@/utils/genUtils.js";
import { autumnBillingPlanToCatalogRows } from "./autumnBillingPlanToCatalogRows.js";
import { autumnBillingPlanToPlanOps } from "./planOps/autumnBillingPlanToPlanOps.js";
import { billingPlanToWorkerEntityIds } from "./routing/billingPlanToWorkerEntityIds.js";

type PlanClient = Pick<BalanceWorkerClient, "applyBillingPlan">;

/** The worker may have applied it: a timeout after the send. */
const isUnknownOutcome = (cause: unknown): boolean =>
	cause instanceof BalanceWorkerClientError && cause.outcome === "unknown";

/** The worker's copy was behind Postgres; it dropped it and wrote nothing. */
const isStaleSubject = (cause: unknown): boolean =>
	cause instanceof BalanceWorkerClientError &&
	cause.workerCode === "STALE_SUBJECT";

/** Every attempt is a fresh command: a refused command's id stays spent in the log. */
const sendPlan = ({
	ctx,
	client,
	customerId,
	autumnBillingPlan,
	ops,
}: {
	ctx: AutumnContext;
	client: PlanClient;
	customerId: string;
	autumnBillingPlan: AutumnBillingPlan;
	ops: BillingPlanOp[];
}): Promise<ApplyBillingPlanReply> => {
	const request: ApplyBillingPlanRequest = parseApplyBillingPlanRequest({
		input: {
			command: {
				...requestContextToCommandBase({ ctx, customerId }),
				type: "applyBillingPlan",
				commandId: generateId("plan"),
				entityIds: billingPlanToWorkerEntityIds({ autumnBillingPlan }),
				ops,
			},
			catalogRows: autumnBillingPlanToCatalogRows({ autumnBillingPlan }),
		},
	});
	return client.applyBillingPlan({ request });
};

/** A create that finds the row it was inserting: an earlier attempt of this same request landed. Someone else's entity is the Postgres lane's 409. */
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

/** The plan as one worker mutation. An unknown outcome, or a stale copy on an update, is sent once more as a new command. */
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
	// Nothing the worker holds changes: only the Postgres remainder writes.
	if (ops.length === 0) return { status: "applied" };

	const createsCustomer = Boolean(autumnBillingPlan.insertCustomer);
	const send = () =>
		sendPlan({ ctx, client, customerId, autumnBillingPlan, ops });
	const sendsAgain = (cause: unknown) =>
		isUnknownOutcome(cause) || (!createsCustomer && isStaleSubject(cause));
	try {
		const reply = await send().catch((cause: unknown) => {
			if (!sendsAgain(cause)) throw cause;
			return send();
		});
		return replyToResult({ reply, autumnBillingPlan });
	} catch (cause) {
		// A create refused as stale collided with a customer Postgres already holds.
		if (createsCustomer && isStaleSubject(cause))
			return { status: "customer_exists" };
		rethrowBalanceWorkerError({ cause });
	}
};
