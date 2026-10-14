import {
	orgToCommandOrg,
	type TrackCommand,
	type TrackUsageEvent,
} from "@autumn/balance-engine";
import { type LockParams, RecaseError, type TrackParams } from "@autumn/shared";
import type { BalanceWorkerRequestContext } from "../../balanceWorker/balanceWorkerRequestContext.js";
import { featureToInternalFeatureId } from "../../balanceWorker/featureToInternalFeatureId.js";
import { lockParamsToTrackLock } from "../../balanceWorker/lockParamsToTrackLock.js";
import { requestContextToCommandBase } from "../../balanceWorker/requestContextToCommandBase.js";

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

const usageEventOf = ({
	ctx,
	body,
	isFanOut,
	recordsUsageEvent,
	recordsCreditCost,
}: {
	ctx: BalanceWorkerRequestContext;
	body: TrackParams;
	isFanOut: boolean;
	recordsUsageEvent: boolean;
	recordsCreditCost: boolean;
}): TrackUsageEvent | null => {
	if (body.skip_event || !recordsUsageEvent) return null;
	return {
		name: (isFanOut ? body.event_name : body.feature_id) ?? "",
		idempotencyKey: body.idempotency_key || null,
		id: ctx.testOptions?.eventId || null,
		...(recordsCreditCost && { recordsCreditCost }),
	};
};

export function trackParamsToTrackCommand({
	ctx,
	body,
	isFanOut = false,
	recordsUsageEvent = true,
	enforceOverdueBlock = false,
	recordsCreditCost = false,
	lock,
}: {
	ctx: BalanceWorkerRequestContext;
	body: TrackParams;
	isFanOut?: boolean;
	recordsUsageEvent?: boolean;
	enforceOverdueBlock?: boolean;
	recordsCreditCost?: boolean;
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
		usageEvent: usageEventOf({
			ctx,
			body,
			isFanOut,
			recordsUsageEvent,
			recordsCreditCost,
		}),
		...(enforceOverdueBlock && { enforceOverdueBlock }),
		...(lock?.enabled && {
			lock: lockParamsToTrackLock({ lock, occurredAt }),
		}),
	};
}

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

export const trackParamsToTrackCommands = ({
	ctx,
	body,
	recordsCreditCost = false,
}: {
	ctx: BalanceWorkerRequestContext;
	body: TrackParams;
	recordsCreditCost?: boolean;
}): TrackCommand[] => {
	const isFanOut = !body.feature_id;
	return trackedFeatureIdsOf({ ctx, body }).map((featureId, index) =>
		trackParamsToTrackCommand({
			ctx,
			body: { ...body, feature_id: featureId },
			isFanOut,
			recordsUsageEvent: index === 0,
			recordsCreditCost,
		}),
	);
};
