import { randomUUID } from "node:crypto";
import {
	AppEnv,
	chatInstallations,
	chatOAuthCredentials,
	createChatInstallState,
	ErrCode,
	organizations,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { addMinutes } from "date-fns";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	createSlackInstallUrl,
	getChatStateSecret,
	getSlackAdminProvider,
} from "../chat/chatUtils.js";

const targetBody = z.strictObject({
	org_id: z.string().min(1),
	env: z.enum(AppEnv),
});

const findTargetOrg = ({
	db,
	orgIdOrSlug,
}: {
	db: DrizzleCli;
	orgIdOrSlug: string;
}) =>
	db.query.organizations.findFirst({
		where: or(
			eq(organizations.id, orgIdOrSlug),
			eq(organizations.slug, orgIdOrSlug),
		),
	});

const getSlackAdminInstallation = async ({ db }: { db: DrizzleCli }) =>
	db.query.chatInstallations.findFirst({
		where: eq(chatInstallations.provider, getSlackAdminProvider()),
	});

const getSlackAdminOAuthCredentials = async ({
	db,
	installationId,
}: {
	db: DrizzleCli;
	installationId: string;
}) =>
	db.query.chatOAuthCredentials.findMany({
		where: eq(chatOAuthCredentials.chat_installation_id, installationId),
	});

export const handleCreateSlackAdminInstall = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const state = createChatInstallState({
			secret: getChatStateSecret(),
			provider: getSlackAdminProvider(),
			orgId: ctx.org.id,
			userId: ctx.userId ?? "",
			env: ctx.env,
			expiresAt: addMinutes(Date.now(), 10).getTime(),
			nonce: randomUUID(),
		});

		return c.json({ url: createSlackInstallUrl(state) });
	},
});

export const handleGetSlackAdminInstall = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const { db } = c.get("ctx");
		const installation = await getSlackAdminInstallation({ db });
		const oauthCredentials = installation
			? await getSlackAdminOAuthCredentials({
					db,
					installationId: installation.id,
				})
			: [];

		return c.json({
			installation: installation
				? {
						id: installation.id,
						workspace_id: installation.workspace_id,
						workspace_name: installation.workspace_name,
						bot_user_id: installation.bot_user_id,
						target_org_id: installation.org_id,
						target_env: installation.default_env,
						updated_at: installation.updated_at,
						installed_by_user_id: installation.installed_by_user_id,
						oauth_credentials: oauthCredentials.map((credential) => ({
							id: credential.id,
							env: credential.env,
							oauth_client_id: credential.oauth_client_id,
							oauth_consent_id: credential.oauth_consent_id,
							access_token_expires_at: credential.access_token_expires_at,
							updated_at: credential.updated_at,
						})),
					}
				: null,
		});
	},
});

export const handleUpdateSlackAdminTarget = createRoute({
	scopes: [Scopes.Superuser],
	body: targetBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;
		const { org_id: orgIdOrSlug, env } = c.req.valid("json");
		const installation = await getSlackAdminInstallation({ db });
		if (!installation) {
			throw new RecaseError({
				message: "Slack admin bot is not installed",
				code: ErrCode.InvalidRequest,
				statusCode: 404,
			});
		}

		const targetOrg = await findTargetOrg({ db, orgIdOrSlug });
		if (!targetOrg) {
			throw new RecaseError({
				message: "Target org not found for ID or slug",
				code: ErrCode.OrgNotFound,
				statusCode: 404,
			});
		}

		const updated = await db.transaction(async (tx) => {
			const now = Date.now();
			const [updatedInstallation] = await tx
				.update(chatInstallations)
				.set({
					org_id: targetOrg.id,
					default_env: env,
					installed_by_user_id: ctx.userId,
					updated_at: now,
				})
				.where(eq(chatInstallations.id, installation.id))
				.returning();

			await tx
				.delete(chatOAuthCredentials)
				.where(eq(chatOAuthCredentials.chat_installation_id, installation.id));

			return updatedInstallation;
		});

		return c.json({
			installation: {
				id: updated.id,
				workspace_id: updated.workspace_id,
				workspace_name: updated.workspace_name,
				target_org_id: updated.org_id,
				target_env: updated.default_env,
				updated_at: updated.updated_at,
				installed_by_user_id: updated.installed_by_user_id,
			},
		});
	},
});

export const handleDeleteSlackAdminInstall = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const { db } = c.get("ctx");
		const installation = await getSlackAdminInstallation({ db });
		if (!installation) return c.json({ success: true });

		await db.transaction(async (tx) => {
			await tx
				.delete(chatOAuthCredentials)
				.where(eq(chatOAuthCredentials.chat_installation_id, installation.id));
			await tx
				.delete(chatInstallations)
				.where(
					and(
						eq(chatInstallations.id, installation.id),
						eq(chatInstallations.provider, getSlackAdminProvider()),
					),
				);
		});

		return c.json({ success: true });
	},
});
