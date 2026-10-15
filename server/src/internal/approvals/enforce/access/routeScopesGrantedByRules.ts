import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { memberRulesGrantAction } from "./memberRulesGrantAction";
import {
	getRouteApprovalAction,
	markScopesGrantedByRules,
} from "./routeApprovalAction";

/**
 * A member missing the route's coarse scope may still go ahead when rules
 * decide its action: the action's own approval check then allows or denies.
 */
export const routeScopesGrantedByRules = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<boolean> => {
	const action = getRouteApprovalAction({ ctx });
	if (!action) return false;

	const granted = await memberRulesGrantAction({ ctx, action });
	if (granted) markScopesGrantedByRules({ ctx });
	return granted;
};
