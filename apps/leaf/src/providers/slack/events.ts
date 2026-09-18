type SlackEventEnvelope = {
	event?: SlackEvent;
	team_id?: unknown;
	type?: unknown;
};

type SlackEvent = {
	subtype?: unknown;
	text?: unknown;
	type?: unknown;
};

const isSlackEventEnvelope = (value: unknown): value is SlackEventEnvelope =>
	typeof value === "object" && value !== null;

const isSlackEvent = (value: unknown): value is SlackEvent =>
	typeof value === "object" && value !== null;

const escapeRegex = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const mentionsSlackUser = ({
	text,
	userId,
}: {
	text: string;
	userId: string;
}) => new RegExp(`<@${escapeRegex(userId)}(?:\\|[^>]+)?>`).test(text);

const SLACK_MENTION_PATTERN = /<@([UW][A-Z0-9]+)(?:\|[^>]+)?>/g;

/** Every user id the raw Slack message @-mentions, in order, deduplicated. */
export const slackMentionedUserIds = ({ raw }: { raw: unknown }): string[] => {
	if (!isSlackEvent(raw) || typeof raw.text !== "string") return [];
	const ids = [...raw.text.matchAll(SLACK_MENTION_PATTERN)].flatMap((match) =>
		match[1] ? [match[1]] : [],
	);
	return [...new Set(ids)];
};

/** Whom a message addresses, relative to the bot. Without a known bot id a
 * mention can't be classified, so neither flag is set: delivery stays
 * conditional, but the message is never described as addressed to others. */
export const slackSpeakerMentions = ({
	botUserId,
	mentionedUserIds,
}: {
	botUserId?: string | null;
	mentionedUserIds: ReadonlyArray<string>;
}): { mentionsAgent: boolean; mentionsOthers: boolean } => {
	if (!botUserId) return { mentionsAgent: false, mentionsOthers: false };
	return {
		mentionsAgent: mentionedUserIds.includes(botUserId),
		mentionsOthers: mentionedUserIds.some((id) => id !== botUserId),
	};
};

export const slackMessageMentionsUser = ({
	raw,
	userId,
}: {
	raw: unknown;
	userId?: string | null;
}) => {
	if (!userId || !isSlackEvent(raw) || typeof raw.text !== "string")
		return true;
	return mentionsSlackUser({ text: raw.text, userId });
};

export const getSlackEventWorkspaceId = (body: string) => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return null;
	}
	if (!isSlackEventEnvelope(parsed)) return null;
	return typeof parsed.team_id === "string" ? parsed.team_id : null;
};

export const normalizeSlackEventsBody = ({
	body,
	botUserId,
}: {
	body: string;
	botUserId?: string | null;
}) => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return body;
	}
	if (!isSlackEventEnvelope(parsed) || !isSlackEvent(parsed.event)) {
		return body;
	}

	const event = parsed.event;
	if (
		parsed.type !== "event_callback" ||
		event.type !== "message" ||
		event.subtype ||
		typeof event.text !== "string" ||
		!botUserId ||
		!mentionsSlackUser({ text: event.text, userId: botUserId })
	) {
		return body;
	}

	return JSON.stringify({
		...parsed,
		event: { ...event, type: "app_mention" },
	});
};
