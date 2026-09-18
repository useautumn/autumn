import { orgToCommandOrg, type TrackCommand } from "@autumn/balance-engine";
import type { TrackParams } from "@autumn/shared";
import type { BalanceWorkerRequestContext } from "../../balanceWorker/balanceWorkerRequestContext.js";
import { featureToInternalFeatureId } from "../../balanceWorker/featureToInternalFeatureId.js";
import { requestContextToCommandBase } from "../../balanceWorker/requestContextToCommandBase.js";

export function trackParamsToTrackCommand({
	ctx,
	body,
}: {
	ctx: BalanceWorkerRequestContext;
	body: TrackParams;
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
		commandId: body.idempotency_key
			? JSON.stringify(["track", body.idempotency_key])
			: ctx.id,
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
