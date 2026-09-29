import type { ChatTrustedBot } from "@autumn/shared";
import { findTrustedSlackBot } from "./trustedBots.js";

type SlackEventEnvelope = {
	event?: SlackEvent;
	team_id?: unknown;
	type?: unknown;
};

type SlackEvent = {
	bot_id?: unknown;
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

/** Legacy bot posts carry the `bot_message` subtype; they only count as
 * ordinary messages when a trusted bot sent them. */
const isPlainMessage = ({
	event,
	trustedBots,
}: {
	event: SlackEvent;
	trustedBots?: ChatTrustedBot[];
}) =>
	!event.subtype ||
	(event.subtype === "bot_message" &&
		Boolean(
			findTrustedSlackBot({
				installation: { trusted_bots: trustedBots ?? [] },
				raw: event,
			}),
		));

export const normalizeSlackEventsBody = ({
	body,
	botUserId,
	trustedBots,
}: {
	body: string;
	botUserId?: string | null;
	trustedBots?: ChatTrustedBot[];
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
		!isPlainMessage({ event, trustedBots }) ||
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
