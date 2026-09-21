import { orgToCommandOrg, type TrackCommand } from "@autumn/balance-engine";
import type { TrackParams } from "@autumn/shared";
import type { BalanceWorkerRequestContext } from "../../balanceWorker/balanceWorkerRequestContext.js";
import { featureToInternalFeatureId } from "../../balanceWorker/featureToInternalFeatureId.js";
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
}: {
	ctx: BalanceWorkerRequestContext;
	body: TrackParams;
	/** The request named an event, and this command is one of the features it maps to. */
	isFanOut?: boolean;
}): TrackCommand {
	return {
		...requestContextToCommandBase({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id ?? null,
			occurredAt: body.timestamp ?? ctx.timestamp,
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
	};
}
