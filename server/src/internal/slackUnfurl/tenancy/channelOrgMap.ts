import { env } from "../env.js";

let cache: Record<string, string> | null = null;

const load = (): Record<string, string> => {
	if (cache) return cache;
	let map: Record<string, string> = {};
	try {
		const parsed = JSON.parse(env.SLACK_CHANNEL_ORG_MAP);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			map = parsed;
		}
	} catch {}
	cache = map;
	return map;
};

export const resolveChannelToOrg = (channelId: string): string | null =>
	load()[channelId] ?? null;
