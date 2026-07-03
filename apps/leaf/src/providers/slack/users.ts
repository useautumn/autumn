import { type ChatInstallation, ms } from "@autumn/shared";
import { ChatAuthMode } from "@autumn/shared/models/chatModels/chatEnums";
import { SLACK_EMAIL_SCOPE } from "@autumn/shared/utils/auth/slackScopes";
import { LRUCache } from "lru-cache";
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

// null is a legitimate cached value (stable "no email"), so wrap it —
// lru-cache treats undefined/absent as a miss
const emailCache = new LRUCache<string, { email: string | null }>({
	max: EMAIL_CACHE_MAX_ENTRIES,
	ttl: EMAIL_CACHE_TTL_MS,
});

/** Caches hits and stable misses (bot/deleted/no email); transient failures are not cached. */
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
	const cached = emailCache.get(cacheKey);
	if (cached) {
		return cached.email;
	}

	const lookup = await fetchSlackUserEmailResult({ botToken, slackUserId });
	if (lookup.cacheable) {
		emailCache.set(
			cacheKey,
			{ email: lookup.email },
			{
				ttl: lookup.email ? EMAIL_CACHE_TTL_MS : EMAIL_NEGATIVE_CACHE_TTL_MS,
			},
		);
	}
	return lookup.email;
};
