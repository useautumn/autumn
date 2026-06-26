import {
	type AppEnv,
	type ChatInstallation,
	type ChatProvider,
	chatInstallations,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { isSlackAdminProvider } from "../../slackAdmin/access.js";
import { db } from "../../../lib/db.js";
import { getInstallationOAuthAccessToken } from "./getInstallationOAuthAccessToken.js";

/** Resolve an org's chat installation and a fresh Autumn OAuth access token for
 * the given env. */
export const getOrgInstallationToken = async ({
	env,
	orgId,
	provider,
	workspaceId,
	userId,
}: {
	env: AppEnv;
	orgId: string;
	provider: string;
	workspaceId: string;
	// Web chat resolves a per-user OAuth credential; Slack omits it.
	userId?: string;
}): Promise<{ accessToken: string; installation: ChatInstallation }> => {
	const installation = await db.query.chatInstallations.findFirst({
		where: isSlackAdminProvider({ provider })
			? and(
					eq(chatInstallations.provider, provider as ChatProvider),
					eq(chatInstallations.workspace_id, workspaceId),
				)
			: and(
					eq(chatInstallations.org_id, orgId),
					eq(chatInstallations.provider, provider as ChatProvider),
					eq(chatInstallations.workspace_id, workspaceId),
				),
	});
	if (!installation) {
		throw new Error("Chat installation not found");
	}
	const accessToken = await getInstallationOAuthAccessToken({
		env,
		installation,
		orgId,
		userId,
	});
	return { accessToken, installation };
};
