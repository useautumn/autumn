import { chatInstallations } from "@autumn/shared";
import { SLACK_CONNECT_ADMIN_SCOPES } from "@autumn/shared/utils/auth/slackScopes";
import { WebClient } from "@slack/web-api";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	decryptChatToken,
	getSlackAdminProvider,
} from "@/internal/chat/chatUtils.js";

/** Comma-separated Slack user ids added to every new channel. Defaults to
 * whoever installed the admin bot, so a new channel is never unattended. */
const TEAM_USER_IDS = (process.env.AUTUMN_SUPPORT_SLACK_TEAM_USER_IDS ?? "")
	.split(",")
	.map((userId) => userId.trim())
	.filter(Boolean);

export const SLACK_CHANNEL_PREFIX = "autumn-";
/** Slack caps channel names at 80 characters. */
const MAX_CHANNEL_NAME_LENGTH = 80;
const INVALID_CHANNEL_NAME_CHARS = /[^a-z0-9_-]+/g;

/**
 * The per-org support channels live in Autumn's own workspace, so they're
 * driven by the internal admin install of the Slack agent app (Admin → Slack
 * admin bot). That install requests `SLACK_CONNECT_ADMIN_SCOPES` on top of the
 * agent's scopes; returns null until it's installed with them.
 */
type SlackConnectClient = {
	slack: WebClient;
	teamUserIds: string[];
};

export const getSlackConnectClient = async ({
	db,
}: {
	db: DrizzleCli;
}): Promise<SlackConnectClient | null> => {
	if (!process.env.SLACK_CLIENT_ID) return null;

	const installation = await db.query.chatInstallations.findFirst({
		where: eq(chatInstallations.provider, getSlackAdminProvider()),
	});
	if (!installation) return null;

	const granted = new Set(installation.scopes);
	const hasScopes = SLACK_CONNECT_ADMIN_SCOPES.every((scope) =>
		granted.has(scope),
	);
	if (!hasScopes) return null;

	const installerUserId = installation.installed_by_provider_user_id;
	return {
		slack: new WebClient(
			decryptChatToken({ token: installation.bot_access_token }),
		),
		teamUserIds:
			TEAM_USER_IDS.length > 0 || !installerUserId
				? TEAM_USER_IDS
				: [installerUserId],
	};
};

export const toSlackChannelName = ({ name }: { name: string }) => {
	const sanitized = name.toLowerCase().replace(INVALID_CHANNEL_NAME_CHARS, "-");
	const prefixed = sanitized.startsWith(SLACK_CHANNEL_PREFIX)
		? sanitized
		: `${SLACK_CHANNEL_PREFIX}${sanitized}`;
	return prefixed.slice(0, MAX_CHANNEL_NAME_LENGTH);
};

/** Thrown when the requested name belongs to a channel another org owns. */
export class SlackChannelNameTakenError extends Error {}

// Stamped into the channel purpose so a typed name can't reuse another org's channel.
const orgChannelPurpose = ({ orgId }: { orgId: string }) =>
	`Shared support channel with Autumn (${orgId})`;

const getSlackErrorCode = (error: unknown): string | undefined => {
	if (typeof error !== "object" || error === null || !("data" in error)) {
		return undefined;
	}
	const { data } = error as { data?: { error?: string } };
	return data?.error;
};

const findChannelByName = async ({
	client,
	name,
}: {
	client: SlackConnectClient;
	name: string;
}) => {
	let cursor: string | undefined;
	do {
		const response = await client.slack.conversations.list({
			types: "public_channel",
			limit: 1000,
			cursor,
		});
		const channel = response.channels?.find(
			(candidate) => candidate.name === name,
		);
		if (channel?.id) return channel;
		cursor = response.response_metadata?.next_cursor || undefined;
	} while (cursor);
	return undefined;
};

/** The channel purpose doubles as the ownership record, so a repeat request
 * finds the org's channel by name instead of needing a DB row. */
const getOrCreateChannel = async ({
	client,
	name,
	orgId,
}: {
	client: SlackConnectClient;
	name: string;
	orgId: string;
}): Promise<string> => {
	const purpose = orgChannelPurpose({ orgId });
	try {
		const response = await client.slack.conversations.create({ name });
		const channelId = response.channel?.id;
		if (!channelId) throw new Error("Slack returned no channel id");

		await client.slack.conversations.setPurpose({
			channel: channelId,
			purpose,
		});

		if (client.teamUserIds.length > 0) {
			await client.slack.conversations.invite({
				channel: channelId,
				users: client.teamUserIds.join(","),
			});
		}
		return channelId;
	} catch (error) {
		if (getSlackErrorCode(error) !== "name_taken") throw error;

		const channel = await findChannelByName({ client, name });
		if (!channel?.id) throw error;
		if (channel.purpose?.value !== purpose) {
			throw new SlackChannelNameTakenError(`#${name} is already taken`);
		}
		const channelId = channel.id;

		// An archived channel still holds its name; bring it back.
		try {
			await client.slack.conversations.unarchive({ channel: channelId });
		} catch (unarchiveError) {
			if (getSlackErrorCode(unarchiveError) !== "not_archived") {
				throw unarchiveError;
			}
		}
		return channelId;
	}
};

/** Creates (or reuses) the org's channel and sends a Slack Connect invite to
 * `email`. Slack delivers the invite by email. */
export const inviteToOrgSlackChannel = async ({
	client,
	orgId,
	requestedName,
	email,
}: {
	client: SlackConnectClient;
	orgId: string;
	requestedName: string;
	email: string;
}): Promise<{ channelName: string }> => {
	const channelName = toSlackChannelName({ name: requestedName });
	const channelId = await getOrCreateChannel({
		client,
		name: channelName,
		orgId,
	});

	await client.slack.conversations.inviteShared({
		channel: channelId,
		emails: [email],
	});

	return { channelName };
};
