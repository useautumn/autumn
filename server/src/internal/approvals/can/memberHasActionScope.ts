import { ACTIONS, type ApprovalAction, checkScopes } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** The coarse scope rules narrow. No scopes on the key or session is the routes' legacy fail-open. */
export const memberHasActionScope = ({
	ctx,
	action,
}: {
	ctx: AutumnContext;
	action: ApprovalAction;
}) => {
	if (!ctx.scopes?.length) return true;
	return checkScopes([ACTIONS[action].scope], ctx.scopes).allowed;
};
