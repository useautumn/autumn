import type { TrackCommand } from "@autumn/balance-engine";
import type { FullSubject, TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "../balanceWorker/balanceWorkerErrors.js";
import { fullSubjectToMeteringState } from "../balanceWorker/fullSubjectToMeteringState.js";
import { validateBalanceWorkerRequest } from "../balanceWorker/validateBalanceWorkerRequest.js";
import { trackParamsToTrackCommand } from "../track/balanceWorker/balanceWorkerTrackRequest.js";
import type { BalanceShadowConfig } from "./balanceShadowTypes.js";

export type BalanceShadowPlan =
	| { kind: "copy"; command: TrackCommand }
	| { kind: "skip"; reason: string }
	| { kind: "ignore" };

export function prepareBalanceShadowTrack({
	ctx,
	body,
	fullSubject,
	config,
	now,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	fullSubject: FullSubject;
	config: BalanceShadowConfig;
	now: number;
}): BalanceShadowPlan {
	const enrolled = config.customers.some(
		(customer) =>
			customer.orgId === ctx.org.id &&
			customer.env === ctx.env &&
			customer.customerId === body.customer_id &&
			(!body.feature_id || customer.featureId === body.feature_id),
	);
	if (!enrolled) return { kind: "ignore" };
	if (now >= config.expiresAt)
		return { kind: "skip", reason: "window_expired" };
	if (!body.feature_id || body.event_name)
		return { kind: "skip", reason: "event_name_not_supported" };
	if (!Number.isFinite(body.value ?? 1) || (body.value ?? 1) < 0)
		return { kind: "skip", reason: "value_not_supported" };
	try {
		validateBalanceWorkerRequest({ ctx, body });
		const state = fullSubjectToMeteringState({
			ctx,
			fullSubject,
			featureIds: [body.feature_id],
		});
		const feature = state.featureStatesById[body.feature_id];
		if (feature.kind !== "direct_metered_v1")
			return { kind: "skip", reason: "feature_not_supported" };
		const entitlement = feature.customerEntitlements[0];
		if (
			(entitlement.reset?.nextResetAt != null &&
				entitlement.reset.nextResetAt <= config.expiresAt) ||
			(entitlement.expiresAt != null &&
				entitlement.expiresAt <= config.expiresAt)
		)
			return { kind: "skip", reason: "lifecycle_within_window" };
		const command = trackParamsToTrackCommand({ ctx, body });
		return {
			kind: "copy",
			command: {
				...command,
				properties: null,
				commandId: JSON.stringify(["shadow", config.runId, command.commandId]),
			},
		};
	} catch (error) {
		const reason =
			error instanceof BalanceWorkerUnsupportedError &&
			error.data &&
			typeof error.data === "object" &&
			"reason" in error.data &&
			typeof error.data.reason === "string"
				? error.data.reason
				: "unsupported_customer";
		return { kind: "skip", reason };
	}
}
