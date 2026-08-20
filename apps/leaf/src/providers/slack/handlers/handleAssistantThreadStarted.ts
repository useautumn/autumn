import { autumnOrgContextService } from "../../../internal/autumnMcp/orgContextService.js";
import { getInstallationOAuthAccessToken } from "../../../internal/installations/actions/getInstallationOAuthAccessToken.js";
import { logger } from "../../../lib/logger.js";
import { findInstallationWithOrg } from "../installations.js";
import { getDefaultChatEnv } from "../setup/selectChatEnv.js";

/** Fires when the user opens the assistant pane, before they type: warming
 * the installation token, org-context cache, and MCP client pool here makes
 * the first real turn's setup near-instant. */
export const handleAssistantThreadStarted = async (event: {
	context: { teamId?: string };
}) => {
	const workspaceId = event.context.teamId;
	if (!workspaceId) return;
	try {
		const installation = await findInstallationWithOrg("slack", workspaceId);
		if (!installation) return;
		const env = getDefaultChatEnv();
		const token = await getInstallationOAuthAccessToken({
			env,
			installation,
			orgId: installation.org_id,
		});
		await autumnOrgContextService.load({
			env,
			logger,
			orgId: installation.org_id,
			token,
		});
	} catch (error) {
		logger.warn("Assistant thread prewarm failed", {
			event: "leaf.assistant_prewarm_failed",
			data: { error: error instanceof Error ? error.message : String(error) },
		});
	}
};
