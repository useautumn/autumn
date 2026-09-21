import { orgToCommandOrg, type TrackCommand } from "@autumn/balance-engine";
import type { LockParams, TrackParams } from "@autumn/shared";
import type { BalanceWorkerRequestContext } from "../../balanceWorker/balanceWorkerRequestContext.js";
import { featureToInternalFeatureId } from "../../balanceWorker/featureToInternalFeatureId.js";
import { lockParamsToTrackLock } from "../../balanceWorker/lockParamsToTrackLock.js";
import { requestContextToCommandBase } from "../../balanceWorker/requestContextToCommandBase.js";

/** One per feature on an event-name track, so each feature dedupes on its own and a retry can finish the rest. */
const commandIdOf = ({
	ctx,
	body,
	isFanOut,
}: {
	ctx: BalanceWorkerRequestContext;
	body: TrackParams;
	isFanOut: boolean;
}): string => {
	const scope = isFanOut ? [body.feature_id] : [];
	if (body.idempotency_key)
		return JSON.stringify(["track", body.idempotency_key, ...scope]);
	return [ctx.id, ...scope].join(":");
};

export function trackParamsToTrackCommand({
	ctx,
	body,
	isFanOut = false,
	enforceOverdueBlock = false,
	lock,
}: {
	ctx: BalanceWorkerRequestContext;
	body: TrackParams;
	/** The request named an event, and this command is one of the features it maps to. */
	isFanOut?: boolean;
	/** A check that deducts honours the org's overdue block, as a plain check does. */
	enforceOverdueBlock?: boolean;
	/** Only a check takes a lock; a plain track never does. */
	lock?: LockParams;
}): TrackCommand {
	const occurredAt = body.timestamp ?? ctx.timestamp;
	return {
		...requestContextToCommandBase({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id ?? null,
			occurredAt,
		}),
		type: "track",
		org: orgToCommandOrg({ org: ctx.org }),
		commandId: commandIdOf({ ctx, body, isFanOut }),
		featureId: body.feature_id!,
		internalFeatureId: featureToInternalFeatureId({
			ctx,
			featureId: body.feature_id!,
		}),
		value: body.value ?? 1,
		overageBehavior: body.overage_behavior ?? "cap",
		properties: body.properties ?? null,
		...(enforceOverdueBlock && { enforceOverdueBlock }),
		...(lock?.enabled && {
			lock: lockParamsToTrackLock({ lock, occurredAt }),
		}),
	};
}
