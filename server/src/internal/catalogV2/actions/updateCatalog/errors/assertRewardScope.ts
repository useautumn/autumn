import {
	checkScopes,
	ErrCode,
	RecaseError,
	Scopes,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * The catalog routes carry plan and feature scopes; rewards are only demanded
 * of a payload that speaks for them, so an existing plans-only key keeps
 * working. Keys with no scopes at all fail open, as everywhere else.
 */
export const assertRewardScope = ({
	ctx,
	params,
	preview,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
	preview: boolean;
}) => {
	if (params.rewards === undefined && params.referral_programs === undefined)
		return;
	if (!ctx.scopes.length) return;

	const scope = preview ? Scopes.Rewards.Read : Scopes.Rewards.Write;
	const { allowed, missing } = checkScopes([scope], ctx.scopes);
	if (allowed) return;
	throw new RecaseError({
		message: `Insufficient scopes. Missing: ${missing.join(", ")}`,
		code: ErrCode.InsufficientScopes,
		statusCode: 403,
	});
};
