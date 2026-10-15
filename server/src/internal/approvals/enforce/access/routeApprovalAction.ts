import type { ApprovalAction } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const ROUTE_APPROVAL_ACTION_KEY = "routeApprovalAction";

/** Records the approval action this request performs, for the route's scope check. */
export const setRouteApprovalAction = ({
	ctx,
	action,
}: {
	ctx: AutumnContext;
	action: ApprovalAction;
}) => {
	ctx.state[ROUTE_APPROVAL_ACTION_KEY] = action;
};

export const getRouteApprovalAction = ({
	ctx,
}: {
	ctx: AutumnContext;
}): ApprovalAction | undefined =>
	ctx.state?.[ROUTE_APPROVAL_ACTION_KEY] as ApprovalAction | undefined;

const SCOPES_GRANTED_BY_RULES_KEY = "scopesGrantedByRules";

/** Set when rules, not coarse scopes, let this request past the route's scope check. */
export const markScopesGrantedByRules = ({ ctx }: { ctx: AutumnContext }) => {
	ctx.state[SCOPES_GRANTED_BY_RULES_KEY] = true;
};

export const scopesWereGrantedByRules = ({
	ctx,
}: {
	ctx: AutumnContext;
}): boolean => ctx.state?.[SCOPES_GRANTED_BY_RULES_KEY] === true;
