import { isSecretKeyPrefix } from "@autumn/auth";
import type { AppEnv } from "@autumn/shared";

/** Import-light on purpose: the eve agent bundle pulls this file, and its
 * transitive graph must stay free of node-only deps (pino et al). */
export const autumnMcpHeaders = ({
	appEnv,
	token,
	approvalsActingUser,
}: {
	appEnv: AppEnv;
	token: string;
	/** The Autumn user who approved a Slack card, so rules are checked against them. */
	approvalsActingUser?: string;
}) => {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		"x-autumn-environment": appEnv,
	};
	if (approvalsActingUser) {
		headers["x-approvals-acting-user"] = approvalsActingUser;
	}
	if (isSecretKeyPrefix({ token })) {
		headers["secret-key"] = token;
	}
	return headers;
};
