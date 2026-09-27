import { WebClient } from "@slack/web-api";

/**
 * Slack Connect config for the per-org support channels in Autumn's own Slack
 * workspace. Kept off the bare `SLACK_*` names, which belong to other apps in
 * the shared vault.
 *
 * The bot needs `channels:manage`, `channels:read` and
 * `conversations.connect:write` (plus `channels:write.invites` when
 * `AUTUMN_SUPPORT_SLACK_TEAM_USER_IDS` is set), on a paid Slack plan.
 */
const env = {
	botToken: process.env.AUTUMN_SUPPORT_SLACK_BOT_TOKEN ?? "",
	/** Comma-separated Slack user ids added to every new channel. */
	teamUserIds: (process.env.AUTUMN_SUPPORT_SLACK_TEAM_USER_IDS ?? "")
		.split(",")
		.map((userId) => userId.trim())
		.filter(Boolean),
};

const CHANNEL_PREFIX = "autumn-";
/** Slack caps channel names at 80 characters. */
const MAX_CHANNEL_NAME_LENGTH = 80;
const INVALID_CHANNEL_NAME_CHARS = /[^a-z0-9_-]+/g;

let client: WebClient | null = null;

export const isSlackConnectConfigured = (): boolean => env.botToken !== "";

const getClient = (): WebClient => {
	client ??= new WebClient(env.botToken);
	return client;
};

export const toSlackChannelName = ({ orgSlug }: { orgSlug: string }) =>
	`${CHANNEL_PREFIX}${orgSlug.toLowerCase().replace(INVALID_CHANNEL_NAME_CHARS, "-")}`.slice(
		0,
		MAX_CHANNEL_NAME_LENGTH,
	);

const getSlackErrorCode = (error: unknown): string | undefined => {
	if (typeof error !== "object" || error === null || !("data" in error)) {
		return undefined;
	}
	const { data } = error as { data?: { error?: string } };
	return data?.error;
};

const findChannelIdByName = async ({
	name,
}: {
	name: string;
}): Promise<string | undefined> => {
	let cursor: string | undefined;
	do {
		const response = await getClient().conversations.list({
			types: "public_channel",
			limit: 1000,
			cursor,
		});
		const channel = response.channels?.find(
			(candidate) => candidate.name === name,
		);
		if (channel?.id) return channel.id;
		cursor = response.response_metadata?.next_cursor || undefined;
	} while (cursor);
	return undefined;
};

/** Channel names are deterministic per org, so the channel doubles as the
 * record: a second request finds it by name instead of needing a DB row. */
const getOrCreateChannel = async ({
	name,
}: {
	name: string;
}): Promise<string> => {
	try {
		const response = await getClient().conversations.create({ name });
		const channelId = response.channel?.id;
		if (!channelId) throw new Error("Slack returned no channel id");

		if (env.teamUserIds.length > 0) {
			await getClient().conversations.invite({
				channel: channelId,
				users: env.teamUserIds.join(","),
			});
		}
		return channelId;
	} catch (error) {
		if (getSlackErrorCode(error) !== "name_taken") throw error;

		const channelId = await findChannelIdByName({ name });
		if (!channelId) throw error;

		// An archived channel still holds its name; bring it back.
		try {
			await getClient().conversations.unarchive({ channel: channelId });
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
	orgSlug,
	email,
}: {
	orgSlug: string;
	email: string;
}): Promise<{ channelName: string }> => {
	const channelName = toSlackChannelName({ orgSlug });
	const channelId = await getOrCreateChannel({ name: channelName });

	await getClient().conversations.inviteShared({
		channel: channelId,
		emails: [email],
	});

	return { channelName };
};
