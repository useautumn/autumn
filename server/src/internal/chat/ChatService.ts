import { randomUUID } from "node:crypto";
import {
	AppEnv,
	apiKeys,
	type ChatAuthMode,
	chatInstallations,
	chatOAuthCredentials,
	chatThreadContexts,
	createChatInstallState,
} from "@autumn/shared";
import { addMinutes } from "date-fns";
import { and, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	createSlackInstallUrl,
	getChatStateSecret,
	getMissingSlackScopes,
	slackProvider,
} from "./chatUtils.js";

export class ChatService {
	static async listInstallations(ctx: AutumnContext) {
		const installations = await ctx.db.query.chatInstallations.findMany({
			where: and(
				eq(chatInstallations.org_id, ctx.org.id),
				eq(chatInstallations.provider, slackProvider),
			),
		});

		const credentials = installations.length
			? await ctx.db.query.chatOAuthCredentials.findMany({
					where: inArray(
						chatOAuthCredentials.chat_installation_id,
						installations.map((installation) => installation.id),
					),
				})
			: [];
		const scopesByInstallationEnv = new Map(
			credentials.map((credential) => [
				`${credential.chat_installation_id}:${credential.env}`,
				credential.scopes,
			]),
		);

		return installations.map((installation) => {
			const missingScopes = getMissingSlackScopes(installation.scopes);
			return {
				connected: true,
				provider: installation.provider,
				workspace_id: installation.workspace_id,
				workspace_name: installation.workspace_name,
				bot_user_id: installation.bot_user_id,
				default_env: installation.default_env,
				auth_mode: installation.auth_mode,
				scopes: installation.scopes,
				agent_scopes:
					scopesByInstallationEnv.get(
						`${installation.id}:${installation.default_env}`,
					) ?? [],
				missing_scopes: missingScopes,
				needs_reconnect: missingScopes.length > 0,
				created_at: installation.created_at,
				updated_at: installation.updated_at,
			};
		});
	}

	static createInstallUrl(
		ctx: AutumnContext,
		{
			env = AppEnv.Live,
			mode,
			scopes,
		}: { env?: AppEnv; mode?: ChatAuthMode; scopes?: string[] },
	) {
		const state = createChatInstallState({
			secret: getChatStateSecret(),
			provider: slackProvider,
			orgId: ctx.org.id,
			userId: ctx.userId ?? "",
			env,
			mode,
			scopes,
			expiresAt: addMinutes(Date.now(), 10).getTime(),
			nonce: randomUUID(),
		});
		const url = createSlackInstallUrl(state);

		console.info("[chat] Created install URL", {
			provider: slackProvider,
			orgId: ctx.org.id,
			env,
			redirectUri:
				new URL(url).searchParams.get("redirect_uri") ?? "Slack app default",
		});

		return url;
	}

	static async disconnect(ctx: AutumnContext) {
		await ctx.db.transaction(async (tx) => {
			const installations = await tx.query.chatInstallations.findMany({
				where: and(
					eq(chatInstallations.org_id, ctx.org.id),
					eq(chatInstallations.provider, slackProvider),
				),
			});

			const keyIds = installations
				.flatMap((installation) => [
					installation.sandbox_api_key_id,
					installation.live_api_key_id,
				])
				.filter((id): id is string => !!id);
			const installationIds = installations.map(
				(installation) => installation.id,
			);
			for (const id of keyIds) {
				await tx
					.delete(apiKeys)
					.where(and(eq(apiKeys.id, id), eq(apiKeys.org_id, ctx.org.id)));
			}
			if (installationIds.length > 0) {
				await tx
					.delete(chatThreadContexts)
					.where(
						inArray(chatThreadContexts.chat_installation_id, installationIds),
					);
			}

			await tx
				.delete(chatInstallations)
				.where(
					and(
						eq(chatInstallations.org_id, ctx.org.id),
						eq(chatInstallations.provider, slackProvider),
					),
				);
		});
	}
}
