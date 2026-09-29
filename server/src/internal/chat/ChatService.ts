import { randomUUID } from "node:crypto";
import {
	AppEnv,
	apiKeys,
	chatInstallations,
	chatOAuthCredentials,
	chatThreadContexts,
	createChatInstallState,
	ErrCode,
	member,
	RecaseError,
} from "@autumn/shared";
import type {
	ChatAuthMode,
	ChatReplyMode,
} from "@autumn/shared/models/chatModels/chatEnums";
import type {
	ChatTrustedBot,
	ChatTrustedBotInput,
} from "@autumn/shared/models/chatModels/chatTrustedBots";
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
				reply_mode: installation.reply_mode,
				trusted_bots: installation.trusted_bots,
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

	static async updateSettings(
		ctx: AutumnContext,
		{
			replyMode,
			trustedBots,
		}: { replyMode?: ChatReplyMode; trustedBots?: ChatTrustedBotInput[] },
	) {
		const installationFilter = and(
			eq(chatInstallations.org_id, ctx.org.id),
			eq(chatInstallations.provider, slackProvider),
		);
		const installation = await ctx.db.query.chatInstallations.findFirst({
			where: installationFilter,
			columns: { id: true, trusted_bots: true },
		});
		if (!installation) return false;

		const nextTrustedBots = trustedBots
			? await ChatService.stampTrustedBots(ctx, {
					existing: installation.trusted_bots,
					trustedBots,
				})
			: undefined;

		await ctx.db
			.update(chatInstallations)
			.set({
				...(replyMode ? { reply_mode: replyMode } : {}),
				...(nextTrustedBots ? { trusted_bots: nextTrustedBots } : {}),
				updated_at: Date.now(),
			})
			.where(installationFilter);
		return true;
	}

	/** A bot runs as an org member, so every run-as user must belong to this
	 * org. Bots already on the list keep who added them and when. */
	private static async stampTrustedBots(
		ctx: AutumnContext,
		{
			existing,
			trustedBots,
		}: { existing: ChatTrustedBot[]; trustedBots: ChatTrustedBotInput[] },
	): Promise<ChatTrustedBot[]> {
		const runAsUserIds = [
			...new Set(trustedBots.map((bot) => bot.run_as_user_id)),
		];
		const members = runAsUserIds.length
			? await ctx.db.query.member.findMany({
					where: and(
						eq(member.organizationId, ctx.org.id),
						inArray(member.userId, runAsUserIds),
					),
					columns: { userId: true },
				})
			: [];
		const memberUserIds = new Set(members.map((row) => row.userId));
		const nonMember = trustedBots.find(
			(bot) => !memberUserIds.has(bot.run_as_user_id),
		);
		if (nonMember) {
			throw new RecaseError({
				message: `${nonMember.name} must run as a member of this organization.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const existingBySlackId = new Map(
			existing.map((bot) => [bot.slack_id, bot]),
		);
		const now = Date.now();
		return trustedBots.map((bot) => {
			const previous = existingBySlackId.get(bot.slack_id);
			return {
				slack_id: bot.slack_id,
				name: bot.name,
				run_as_user_id: bot.run_as_user_id,
				added_by_user_id: previous?.added_by_user_id ?? ctx.userId ?? null,
				added_at: previous?.added_at ?? now,
			};
		});
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
