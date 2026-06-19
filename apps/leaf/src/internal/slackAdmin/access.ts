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

const adminUserIds = () =>
	new Set(
		(env.SLACK_ADMIN_USER_IDS ?? "")
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean),
	);

export const validateSlackAdminAccessConfig = ({
	configuredWorkspaceId,
	isProduction,
	providerUserId,
	userIds,
	workspaceId,
}: {
	configuredWorkspaceId?: string;
	isProduction: boolean;
	providerUserId: string;
	userIds: Set<string>;
	workspaceId: string;
}): { allowed: true } | { allowed: false; reason: string } => {
	if (isProduction && !configuredWorkspaceId) {
		return { allowed: false, reason: "admin_config_missing" };
	}
	if (configuredWorkspaceId && workspaceId !== configuredWorkspaceId) {
		return { allowed: false, reason: "wrong_workspace" };
	}
	if (userIds.size > 0 && !userIds.has(providerUserId)) {
		return { allowed: false, reason: "user_not_allowed" };
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
	if (isProduction && !configuredWorkspaceId) return false;
	if (!configuredWorkspaceId) return true;
	return workspaceId === configuredWorkspaceId;
};

export const validateSlackAdminAccess = ({
	providerUserId,
	workspaceId,
}: {
	providerUserId: string;
	workspaceId: string;
}) =>
	validateSlackAdminAccessConfig({
		configuredWorkspaceId: env.SLACK_ADMIN_WORKSPACE_ID,
		isProduction: process.env.NODE_ENV === "production",
		providerUserId,
		userIds: adminUserIds(),
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
