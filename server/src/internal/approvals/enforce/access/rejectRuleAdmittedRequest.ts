import {
	ACTIONS,
	type ApprovalAction,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { scopesWereGrantedByRules } from "./routeApprovalAction";

/**
 * For a write no rule decides: a member let past the route's scopes by rules
 * gets the scope error they'd have had, so no path skips both checks.
 */
export const rejectRuleAdmittedRequest = ({
	ctx,
	action,
}: {
	ctx: AutumnContext;
	action: ApprovalAction;
}) => {
	if (!scopesWereGrantedByRules({ ctx })) return;
	throw new RecaseError({
		message: `Insufficient scopes. Missing: ${ACTIONS[action].scope}`,
		code: ErrCode.InsufficientScopes,
		statusCode: 403,
	});
};
