import { env } from "../env.js";

/**
 * THE tenancy key is channel_id, not team_id (single-install model — every
 * event arrives in our workspace). Each channel maps to exactly one org.
 * Prototype source is an env JSON blob; swap for a DB table later.
 */
let cache: Record<string, string> | null = null;

const load = (): Record<string, string> => {
	if (cache) return cache;
	let map: Record<string, string> = {};
	try {
		const parsed = JSON.parse(env.SLACK_CHANNEL_ORG_MAP);
		if (parsed && typeof parsed === "object") map = parsed;
	} catch {
		// fall through to empty map
	}
	cache = map;
	return map;
};

/**
 * Resolve a channel to its org. Returns `null` for unmapped channels — the
 * caller MUST decline to render rather than guess a tenant.
 */
export const resolveChannelToOrg = (channelId: string): string | null =>
	load()[channelId] ?? null;
