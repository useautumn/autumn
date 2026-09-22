import { orgToCommandOrg, type TrackCommand } from "@autumn/balance-engine";
import { type LockParams, RecaseError, type TrackParams } from "@autumn/shared";
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

/** A feature id tracks itself; an event name tracks every feature that lists it. */
export const trackedFeatureIdsOf = ({
	ctx,
	body,
}: {
	ctx: Pick<BalanceWorkerRequestContext, "features">;
	body: TrackParams;
}): string[] => {
	if (body.feature_id) return [body.feature_id];
	const featureIds = ctx.features
		.filter((feature) => feature.event_names?.includes(body.event_name ?? ""))
		.map((feature) => feature.id);
	if (featureIds.length === 0)
		throw new RecaseError({
			message: `No features found for event name: ${body.event_name}`,
			statusCode: 404,
		});
	return featureIds;
};

/** One command per feature the item tracks; an event name fans out, a feature id is one command. */
export const trackParamsToTrackCommands = ({
	ctx,
	body,
}: {
	ctx: BalanceWorkerRequestContext;
	body: TrackParams;
}): TrackCommand[] => {
	const isFanOut = !body.feature_id;
	return trackedFeatureIdsOf({ ctx, body }).map((featureId) =>
		trackParamsToTrackCommand({
			ctx,
			body: { ...body, feature_id: featureId },
			isFanOut,
		}),
	);
};
