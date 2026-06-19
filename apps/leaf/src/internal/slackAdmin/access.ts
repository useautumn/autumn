import { type ChatInstallation, organizations } from "@autumn/shared";
import { eq, or } from "drizzle-orm";
import { db } from "../../lib/db.js";
import { env } from "../../lib/env.js";

export const isSlackAdminProvider = ({ provider }: { provider: string }) =>
	provider === "slack_admin" || provider.startsWith("slack_admin:");

export const isSlackAdminInstallation = ({
	installation,
}: {
	installation: ChatInstallation;
}) => isSlackAdminProvider({ provider: installation.provider });

export const validateSlackAdminAccessConfig = ({
	configuredWorkspaceId,
	workspaceId,
}: {
	configuredWorkspaceId?: string;
	workspaceId: string;
}): { allowed: true } | { allowed: false; reason: string } => {
	if (!configuredWorkspaceId) {
		return { allowed: false, reason: "admin_config_missing" };
	}
	if (configuredWorkspaceId && workspaceId !== configuredWorkspaceId) {
		return { allowed: false, reason: "wrong_workspace" };
	}

	return { allowed: true };
};

export const shouldUseSlackAdminInstallationForWorkspace = ({
	configuredWorkspaceId,
	isProduction,
	workspaceId,
}: {
	configuredWorkspaceId?: string;
	isProduction: boolean;
	workspaceId: string;
}) => {
	if (!configuredWorkspaceId) return false;
	return workspaceId === configuredWorkspaceId;
};

export const validateSlackAdminAccess = ({
	workspaceId,
}: {
	workspaceId: string;
}) =>
	validateSlackAdminAccessConfig({
		configuredWorkspaceId: env.SLACK_ADMIN_WORKSPACE_ID,
		workspaceId,
	});

export const resolveSlackAdminOrg = async ({
	identifier,
}: {
	identifier: string;
}) => {
	const trimmed = identifier.trim();
	if (!trimmed) return null;

	return await db.query.organizations.findFirst({
		where: or(eq(organizations.id, trimmed), eq(organizations.slug, trimmed)),
		columns: { id: true, slug: true },
	});
};
