import type { TrackCommand } from "@autumn/balance-engine";
import type { TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export function trackParamsToTrackCommand({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}): TrackCommand {
	return {
		schemaVersion: 1,
		type: "track",
		commandId: body.idempotency_key
			? JSON.stringify(["track", body.idempotency_key])
			: ctx.id,
		requestId: ctx.id,
		identity: {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: body.customer_id,
		},
		entityId: body.entity_id ?? null,
		featureId: body.feature_id!,
		value: body.value ?? 1,
		overageBehavior: body.overage_behavior ?? "cap",
		properties: body.properties ?? null,
		occurredAt: body.timestamp ?? ctx.timestamp,
	};
}
