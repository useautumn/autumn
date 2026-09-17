import {
	catalogRowsToCatalog,
	subjectStateToFullSubject,
	type TrackCommand,
} from "@autumn/balance-engine";
import {
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "../balanceWorker/balanceWorkerErrors.js";
import {
	fullSubjectToCatalogRows,
	fullSubjectToSubjectState,
} from "../balanceWorker/fullSubjectToSubjectState.js";
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
		const state = fullSubjectToSubjectState({
			ctx,
			fullSubject,
			featureIds: [body.feature_id],
		});
		const catalog = catalogRowsToCatalog({
			rows: fullSubjectToCatalogRows({
				ctx,
				fullSubject,
				featureIds: [body.feature_id],
			}),
		});
		const [entitlement] = fullSubjectToCustomerEntitlements({
			fullSubject: subjectStateToFullSubject({ state, catalog }),
			featureIds: [body.feature_id],
		});
		if (
			!entitlement ||
			(entitlement.next_reset_at != null &&
				entitlement.next_reset_at <= config.expiresAt) ||
			(entitlement.expires_at != null &&
				entitlement.expires_at <= config.expiresAt)
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
