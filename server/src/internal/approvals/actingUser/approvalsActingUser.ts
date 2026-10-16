import { SLACK_MCP_OAUTH_CLIENT_ID } from "@autumn/auth/oauth";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const ACTING_USER_KEY = "approvalsActingUserId";

/**
 * Leaf runs an approved Slack write with its installation token, naming the
 * clicker in `x-approvals-acting-user`. Any other caller's header is ignored.
 */
export const setApprovalsActingUser = ({
	ctx,
	oauthClientId,
	header,
}: {
	ctx: AutumnContext;
	oauthClientId: string | null;
	header: string | undefined;
}) => {
	if (oauthClientId !== SLACK_MCP_OAUTH_CLIENT_ID || !header) return;
	ctx.state[ACTING_USER_KEY] = header;
};

export const getApprovalsActingUser = ({
	ctx,
}: {
	ctx: AutumnContext;
}): string | undefined => ctx.state?.[ACTING_USER_KEY] as string | undefined;
