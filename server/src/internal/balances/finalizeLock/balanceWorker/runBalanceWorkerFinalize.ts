import { type FinalizeCommand, orgToCommandOrg } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import {
	ErrCode,
	type FinalizeLockParamsV0,
	InsufficientBalanceError,
	RecaseError,
} from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { featureToInternalFeatureId } from "../../balanceWorker/featureToInternalFeatureId.js";
import { requestContextToCommandBase } from "../../balanceWorker/requestContextToCommandBase.js";
import { getBalanceLock } from "./getBalanceLock.js";

/** Same message as the legacy path: the expiry job recognises an already-settled lock by it. */
const lockNotFoundError = ({ lockId }: { lockId: string }): RecaseError =>
	new RecaseError({
		message: `Lock not found for ID: ${lockId}`,
		code: ErrCode.InvalidRequest,
	});

/** Release settles at zero, an override at that value, a plain confirm at whatever the lock took. */
const finalValueOf = ({
	params,
}: {
	params: FinalizeLockParamsV0;
}): number | null =>
	params.action === "release" ? 0 : (params.override_value ?? null);

export async function runBalanceWorkerFinalize({
	ctx,
	params,
	client = getBalanceWorkerClient(),
	loadLock = getBalanceLock,
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
	client?: Pick<BalanceWorkerClient, "finalize">;
	loadLock?: typeof getBalanceLock;
}): Promise<{ success: true }> {
	const lock = await loadLock({ ctx, lockId: params.lock_id });
	if (!lock) throw lockNotFoundError({ lockId: params.lock_id });

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

	try {
		const { result } = await client.finalize({ command });
		if (result.status === "rejected")
			throw new InsufficientBalanceError({
				featureId: lock.feature_id,
				value: result.finalValue,
			});
		return { success: true };
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}
