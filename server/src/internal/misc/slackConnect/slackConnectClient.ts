import { chatInstallations } from "@autumn/shared";
import { SLACK_CONNECT_ADMIN_SCOPES } from "@autumn/shared/utils/auth/slackScopes";
import { type ConversationsListResponse, WebClient } from "@slack/web-api";
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
/** Each request can name a new channel, so cap how many one org can create. */
export const MAX_SLACK_CHANNELS_PER_ORG = 2;

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

/** Thrown when the requested name belongs to a channel the org doesn't own. */
export class SlackChannelNameTakenError extends Error {}

/** Thrown when the org already has `MAX_SLACK_CHANNELS_PER_ORG` channels. */
export class SlackChannelLimitError extends Error {}

// Stamped into the channel purpose so a typed name can't reuse another org's
// channel. It's also the only record of which channels an org owns.
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

/** Every public channel in the workspace, archived ones included. */
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

/** Renames and archives a channel whose setup failed before it was stamped,
 * so its name is free for the next request instead of being held by a
 * channel no org owns. Best effort: the caller rethrows the setup error. */
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
	} catch {
		// Leave it; someone can free the name by hand.
	}
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

/** Returns the channel if the org owns it (unarchiving it if needed), throws
 * if someone else holds the name, and returns undefined if the name is free. */
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
	// An archived channel still holds its name; bring it back.
	if (channel.is_archived) {
		await unarchiveChannel({ client, channelId: channel.id });
	}
	return channel.id;
};

/** The channel purpose doubles as the ownership record, so both the reuse
 * check and the per-org limit read it from Slack instead of a DB row. */
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
		// Either a concurrent request just created it (reuse it if it's this
		// org's), or a private channel we can't list holds the name.
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
