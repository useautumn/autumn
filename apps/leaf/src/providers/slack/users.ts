import {
	ChatAuthMode,
	type ChatInstallation,
	SLACK_EMAIL_SCOPE,
	ms,
} from "@autumn/shared";
import { z } from "zod";

const SLACK_USERS_INFO_URL = "https://slack.com/api/users.info";

export const installationHasEmailScope = ({
	installation,
}: {
	installation: Pick<ChatInstallation, "scopes">;
}): boolean => (installation.scopes ?? []).includes(SLACK_EMAIL_SCOPE);

export const resolveInstallationAuthMode = ({
	installation,
}: {
	installation: Pick<ChatInstallation, "auth_mode" | "scopes">;
}): ChatAuthMode => {
	if (installation.auth_mode) return installation.auth_mode;
	return installationHasEmailScope({ installation })
		? ChatAuthMode.PerUser
		: ChatAuthMode.Unrestricted;
};

const slackUsersInfoSchema = z.object({
	ok: z.boolean(),
	error: z.string().optional(),
	user: z
		.object({
			id: z.string(),
			deleted: z.boolean().optional(),
			is_bot: z.boolean().optional(),
			profile: z
				.object({
					email: z.string().optional(),
				})
				.passthrough()
				.optional(),
		})
		.optional(),
});

type SlackUserEmailLookup = { email: string | null; cacheable: boolean };

const fetchSlackUserEmailResult = async ({
	botToken,
	slackUserId,
}: {
	botToken: string;
	slackUserId: string;
}): Promise<SlackUserEmailLookup> => {
	const url = new URL(SLACK_USERS_INFO_URL);
	url.searchParams.set("user", slackUserId);

	try {
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${botToken}` },
		});
		if (!response.ok) {
			return { cacheable: false, email: null };
		}

		const parsed = slackUsersInfoSchema.safeParse(await response.json());
		if (!(parsed.success && parsed.data.ok) || !parsed.data.user) {
			return { cacheable: false, email: null };
		}

		const { user } = parsed.data;
		if (user.deleted || user.is_bot) {
			return { cacheable: true, email: null };
		}

		const email = user.profile?.email?.trim();
		return { cacheable: true, email: email ? email : null };
	} catch {
		return { cacheable: false, email: null };
	}
};

export const fetchSlackUserEmail = async (params: {
	botToken: string;
	slackUserId: string;
}): Promise<string | null> => (await fetchSlackUserEmailResult(params)).email;

const EMAIL_CACHE_TTL_MS = ms.minutes(10);
const EMAIL_NEGATIVE_CACHE_TTL_MS = ms.minutes(1);
const EMAIL_CACHE_MAX_ENTRIES = 10_000;

type CachedEmail = { email: string | null; expiresAt: number };
const emailCache = new Map<string, CachedEmail>();

// Drop expired entries first, then oldest insertion-order entries if still over
// the cap, so the cache can't grow unbounded across installations/users.
const evictEmailCache = (now: number) => {
	for (const [key, entry] of emailCache) {
		if (entry.expiresAt <= now) {
			emailCache.delete(key);
		}
	}
	let overflow = emailCache.size - EMAIL_CACHE_MAX_ENTRIES;
	if (overflow <= 0) {
		return;
	}
	for (const key of emailCache.keys()) {
		emailCache.delete(key);
		overflow -= 1;
		if (overflow <= 0) {
			break;
		}
	}
};

// Slack emails effectively never change, so cache successful lookups and stable
// negative user states. Transient Slack/API failures are not cached.
export const fetchSlackUserEmailCached = async ({
	botToken,
	installationId,
	slackUserId,
}: {
	botToken: string;
	installationId: string;
	slackUserId: string;
}): Promise<string | null> => {
	const cacheKey = `${installationId}:${slackUserId}`;
	const now = Date.now();
	const cached = emailCache.get(cacheKey);
	if (cached) {
		if (cached.expiresAt > now) {
			return cached.email;
		}
		emailCache.delete(cacheKey);
	}

	const lookup = await fetchSlackUserEmailResult({ botToken, slackUserId });
	if (lookup.cacheable) {
		emailCache.set(cacheKey, {
			email: lookup.email,
			expiresAt:
				now +
				(lookup.email ? EMAIL_CACHE_TTL_MS : EMAIL_NEGATIVE_CACHE_TTL_MS),
		});
		if (emailCache.size > EMAIL_CACHE_MAX_ENTRIES) {
			evictEmailCache(now);
		}
	}
	return lookup.email;
};
