import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { CheckParams } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckResponseWithPreview } from "@/internal/api/check/getCheckPreview.js";
import {
	apiVersionCreatesCustomer,
	type RunWithCustomer,
	withCreateIfMissing,
} from "@/internal/balanceWorker/subject/withCreateIfMissing.js";
import { withPaidAllocatedFallback } from "@/internal/balanceWorker/subject/withPaidAllocatedFallback.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { parseCheckParamsForLock } from "../../utils/lock/parseCheckParamsForLock.js";
import { checkAnswerToApiResponse } from "./balanceWorkerCheckReply.js";
import { checkParamsToCheckCommand } from "./balanceWorkerCheckRequest.js";
import {
	requiredBalanceOf,
	runDeductingCheck,
	type WorkerCheckAnswer,
} from "./runDeductingCheck.js";
import { runPostgresDeductingCheck } from "./runPostgresDeductingCheck.js";
import { triggerAutoTopupFromCheckAnswer } from "./triggerAutoTopupFromCheckAnswer.js";

/** One worker call per check: a read when it only asks, a track when it also deducts. */
export async function runBalanceWorkerCheck({
	ctx,
	body: rawBody,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	body: CheckParams;
	client?: Pick<BalanceWorkerClient, "check" | "track">;
}): Promise<CheckResponseWithPreview> {
	// Validates the lock, gives it an id when the caller sent none, and drops a disabled one.
	const body = parseCheckParamsForLock({ params: rawBody });
	const command = checkParamsToCheckCommand({ ctx, body });
	const isDeductingCheck = body.send_event === true || body.lock !== undefined;
	const answerToResult = async (
		answer: WorkerCheckAnswer,
	): Promise<RunWithCustomer<CheckResponseWithPreview>> => ({
		result: await checkAnswerToApiResponse({
			ctx,
			command,
			answer,
			isDeductingCheck,
			withPreview: body.with_preview,
		}),
		customer: answer.state?.customer ?? null,
	});
	// Only a plain check tops up here: a deducting check is a track whose record reaches herald, which dispatches.
	const plainCheck = async (): Promise<
		RunWithCustomer<CheckResponseWithPreview>
	> => {
		const answer = await client.check({ command });
		triggerAutoTopupFromCheckAnswer({ ctx, command, answer });
		return answerToResult(answer);
	};
	// Deducts on the same engine a track would: Postgres when the worker refuses a v1 paid allocated grant.
	const deductingCheck = (): Promise<
		RunWithCustomer<CheckResponseWithPreview>
	> =>
		withPaidAllocatedFallback({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			worker: async () =>
				answerToResult(await runDeductingCheck({ ctx, body, client })),
			postgres: async ({ fullSubject }) => ({
				result: await runPostgresDeductingCheck({
					ctx,
					body,
					requiredBalance: requiredBalanceOf({ body }),
					fullSubject,
				}),
				customer: fullSubject.customer,
			}),
		});
	const checkOnWorker = async (): Promise<
		RunWithCustomer<CheckResponseWithPreview>
	> => {
		try {
			return isDeductingCheck ? await deductingCheck() : await plainCheck();
		} catch (cause) {
			rethrowBalanceWorkerError({ cause });
		}
	};
	return withCreateIfMissing({
		ctx,
		createEnabled: apiVersionCreatesCustomer({ ctx }),
		customerId: body.customer_id,
		customerData: body.customer_data,
		entityId: body.entity_id,
		entityData: body.entity_data,
		run: checkOnWorker,
	});
}
