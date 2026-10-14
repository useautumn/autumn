import { isStagingEnv } from "@autumn/env";
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

/** A check body's verdict; null for a body without one, a track's included. */
export const allowedOf = ({ body }: { body: unknown }): boolean | null => {
	if (typeof body !== "object" || body === null) return null;
	const { allowed } = body as { allowed?: unknown };
	return typeof allowed === "boolean" ? allowed : null;
};
