import { chatInstallations } from "@autumn/shared";
import { SLACK_CONNECT_ADMIN_SCOPES } from "@autumn/shared/utils/auth/slackScopes";
import { type ConversationsListResponse, WebClient } from "@slack/web-api";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	decryptChatToken,
	getSlackAdminProvider,
} from "@/internal/chat/chatUtils.js";

const TEAM_USER_IDS = (process.env.AUTUMN_SUPPORT_SLACK_TEAM_USER_IDS ?? "")
	.split(",")
	.map((userId) => userId.trim())
	.filter(Boolean);

export const SLACK_CHANNEL_PREFIX = "autumn-";
const MAX_CHANNEL_NAME_LENGTH = 80;
const INVALID_CHANNEL_NAME_CHARS = /[^a-z0-9_-]+/g;
export const MAX_SLACK_CHANNELS_PER_ORG = 2;

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

export class SlackChannelNameTakenError extends Error {}

export class SlackChannelLimitError extends Error {}

const orgChannelPurpose = ({ orgId }: { orgId: string }) =>
	`Shared support channel with Autumn (${orgId})`;

type SlackChannel = NonNullable<ConversationsListResponse["channels"]>[number];

const getSlackErrorCode = (error: unknown): string | undefined => {
	if (typeof error !== "object" || error === null || !("data" in error)) {
		return undefined;
	}
	const { data } = error as { data?: { error?: string } };
	return data?.error;
};

const listPublicChannels = async ({
	client,
}: {
	client: SlackConnectClient;
}): Promise<SlackChannel[]> => {
	const channels: SlackChannel[] = [];
	let cursor: string | undefined;
	do {
		const response = await client.slack.conversations.list({
			types: "public_channel",
			limit: 1000,
			cursor,
		});
		for (const channel of response.channels ?? []) channels.push(channel);
		cursor = response.response_metadata?.next_cursor || undefined;
	} while (cursor);
	return channels;
};

const releaseUnstampedChannel = async ({
	client,
	channelId,
}: {
	client: SlackConnectClient;
	channelId: string;
}) => {
	try {
		await client.slack.conversations.rename({
			channel: channelId,
			name: `${SLACK_CHANNEL_PREFIX}unused-${channelId.toLowerCase()}`,
		});
		await client.slack.conversations.archive({ channel: channelId });
	} catch {}
};

const unarchiveChannel = async ({
	client,
	channelId,
}: {
	client: SlackConnectClient;
	channelId: string;
}) => {
	try {
		await client.slack.conversations.unarchive({ channel: channelId });
	} catch (error) {
		if (getSlackErrorCode(error) !== "not_archived") throw error;
	}
};

const reuseOwnedChannel = async ({
	client,
	channel,
	name,
	purpose,
}: {
	client: SlackConnectClient;
	channel: SlackChannel | undefined;
	name: string;
	purpose: string;
}): Promise<string | undefined> => {
	if (!channel) return undefined;
	if (!channel.id || channel.purpose?.value !== purpose) {
		throw new SlackChannelNameTakenError(`#${name} is already taken`);
	}
	if (channel.is_archived) {
		await unarchiveChannel({ client, channelId: channel.id });
	}
	return channel.id;
};

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
	const channels = await listPublicChannels({ client });

	const ownedChannelId = await reuseOwnedChannel({
		client,
		channel: channels.find((channel) => channel.name === name),
		name,
		purpose,
	});
	if (ownedChannelId) return ownedChannelId;

	const orgChannels = channels.filter(
		(channel) => channel.purpose?.value === purpose,
	);
	if (orgChannels.length >= MAX_SLACK_CHANNELS_PER_ORG) {
		const names = orgChannels.map((channel) => `#${channel.name}`).join(", ");
		throw new SlackChannelLimitError(
			`Your organization already has ${orgChannels.length} Slack channels with Autumn (${names}). Request an invite to one of those instead`,
		);
	}

	let channelId: string | undefined;
	try {
		const response = await client.slack.conversations.create({ name });
		channelId = response.channel?.id;
	} catch (error) {
		if (getSlackErrorCode(error) !== "name_taken") throw error;
		const racedChannelId = await reuseOwnedChannel({
			client,
			channel: (await listPublicChannels({ client })).find(
				(channel) => channel.name === name,
			),
			name,
			purpose,
		});
		if (racedChannelId) return racedChannelId;
		throw new SlackChannelNameTakenError(`#${name} is already taken`);
	}
	if (!channelId) throw new Error("Slack returned no channel id");

	try {
		await client.slack.conversations.setPurpose({
			channel: channelId,
			purpose,
		});
	} catch (error) {
		await releaseUnstampedChannel({ client, channelId });
		throw error;
	}

	if (client.teamUserIds.length > 0) {
		await client.slack.conversations.invite({
			channel: channelId,
			users: client.teamUserIds.join(","),
		});
	}
	return channelId;
};

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
		external_limited: false,
	});

	return { channelName };
};
