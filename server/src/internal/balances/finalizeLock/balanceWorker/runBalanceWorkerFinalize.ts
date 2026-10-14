import {
	type FinalizeCommand,
	orgToCommandOrg,
	type WorkerLock,
} from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import {
	type FinalizeLockParamsV0,
	InsufficientBalanceError,
} from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { withBalanceWorkerFailOpen } from "../../balanceWorker/failOpen/withBalanceWorkerFailOpen.js";
import { featureToInternalFeatureId } from "../../balanceWorker/featureToInternalFeatureId.js";
import { cancelLockExpirySchedule } from "../../balanceWorker/lockExpirySchedule.js";
import { requestContextToCommandBase } from "../../balanceWorker/requestContextToCommandBase.js";

/** Release settles at zero, an override at that value, a plain confirm at whatever the lock took. */
const finalValueOf = ({
	params,
}: {
	params: FinalizeLockParamsV0;
}): number | null =>
	params.action === "release" ? 0 : (params.override_value ?? null);

type FinalizeClient = Pick<BalanceWorkerClient, "finalize" | "queue">;

const finalizeOnWorker = async ({
	ctx,
	command,
	client,
}: {
	ctx: AutumnContext;
	command: FinalizeCommand;
	client: FinalizeClient;
}): Promise<{ success: true }> => {
	const { lock } = command;
	try {
		const { result } = await client.finalize({ command });
		if (result.status === "rejected")
			throw new InsufficientBalanceError({
				featureId: lock.feature_id,
				value: result.finalValue,
			});
		// Only a caller-supplied expiry had a timer; the 24 hour default is the sweep's.
		if (lock.expiry_action === "release")
			await cancelLockExpirySchedule({ ctx, lockId: lock.lock_id });
		return { success: true };
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
};

/** Settled by the owner in log order once it is back; the lock's expiry stays armed until then. */
const queueFinalize = async ({
	ctx,
	command,
	client,
}: {
	ctx: AutumnContext;
	command: FinalizeCommand;
	client: FinalizeClient;
}): Promise<{ success: true }> => {
	try {
		await client.queue.finalize({ commands: [command] });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
	addToExtraLogs({ ctx, extras: { finalizeLockQueuedForReplay: true } });
	return { success: true };
};

export async function runBalanceWorkerFinalize({
	ctx,
	params,
	lock,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
	lock: WorkerLock;
	client?: FinalizeClient;
}): Promise<{ success: true }> {
	const command: FinalizeCommand = {
		...requestContextToCommandBase({
			ctx,
			customerId: lock.customer_id,
			entityId: lock.entity_id,
		}),
		type: "finalize",
		commandId: ctx.id,
		org: orgToCommandOrg({ org: ctx.org }),
		lock,
		internalFeatureId: featureToInternalFeatureId({
			ctx,
			featureId: lock.feature_id,
		}),
		finalValue: finalValueOf({ params }),
		properties: params.properties ?? null,
	};

	const { result } = await withBalanceWorkerFailOpen({
		ctx,
		source: "finalize",
		commandId: command.commandId,
		run: () => finalizeOnWorker({ ctx, command, client }),
		// An unconfirmed finalize may have been rejected; queueing it would answer success for a verdict never heard.
		fallback: ({ error, reason }) =>
			reason === "balance_worker_result_unknown"
				? Promise.reject(error)
				: queueFinalize({ ctx, command, client }),
	});
	return result;
}
