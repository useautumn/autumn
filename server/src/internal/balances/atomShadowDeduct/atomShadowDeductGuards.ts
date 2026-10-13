import { isStagingEnv } from "@autumn/env";
import type { CheckParams, TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { shadowAtomTarget } from "../check/atomShadow/atomShadowGuards.js";
import type { AtomShadowTarget } from "../check/atomShadow/types/atomShadowOutcome.js";

/** Comma-separated org ids whose deductions the staging server sends to the shadow Atom first. */
const ORG_IDS_VAR = "ATOM_SHADOW_DEDUCT_ORG_IDS";

/** The allowlisted orgs; none outside staging, whatever the variable says. */
export const atomShadowDeductOrgIds = ({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): ReadonlySet<string> => {
	if (!isStagingEnv({ runtimeEnv })) return new Set();
	const ids = (runtimeEnv[ORG_IDS_VAR] ?? "").split(",");
	return new Set(ids.map((id) => id.trim()).filter(Boolean));
};

/** The shadow Atom this org's deduction goes to first, or null unless the org is allowlisted on staging and Atom holds the customer. */
export const atomShadowDeductTarget = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): AtomShadowTarget | null => {
	const orgIds = atomShadowDeductOrgIds({ runtimeEnv: process.env });
	if (!orgIds.has(ctx.org.id)) return null;
	return shadowAtomTarget({ ctx, customerId });
};

/** A queued track as the deducting check Atom journals it by; null for what a check can't carry. */
export const trackToAtomCheckParams = ({
	body,
}: {
	body: TrackParams;
}): CheckParams | null => {
	const value = body.value ?? 1;
	if (!body.feature_id || value <= 0) return null;
	if (body.timestamp !== undefined || body.overage_behavior !== undefined)
		return null;
	return {
		customer_id: body.customer_id,
		entity_id: body.entity_id,
		feature_id: body.feature_id,
		required_balance: value,
		properties: body.properties,
		send_event: true,
		skip_event: body.skip_event,
		customer_data: body.customer_data,
		entity_data: body.entity_data,
	};
};

/** Atom granted it, so the deduction is on its journal; a denied one deducted nothing. */
export const isAllowedAnswer = ({ body }: { body: unknown }): boolean =>
	typeof body === "object" &&
	body !== null &&
	(body as { allowed?: unknown }).allowed === true;
