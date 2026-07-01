import {
	ChatAuthMode,
	type ChatInstallation,
	SLACK_EMAIL_SCOPE,
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

/**
 * Read a Slack user's email via the Web API using the workspace bot token.
 * Requires the `users:read.email` scope (added to the Slack manifest).
 *
 * Returns the trimmed email, or `null` when it cannot be read — the API failed,
 * the scope is missing, or the user is a bot / deleted / has no email. Callers
 * treat `null` as "deny": Phase 1 never falls back to a shared token.
 */
export const fetchSlackUserEmail = async ({
	botToken,
	slackUserId,
}: {
	botToken: string;
	slackUserId: string;
}): Promise<string | null> => {
	const url = new URL(SLACK_USERS_INFO_URL);
	url.searchParams.set("user", slackUserId);

	try {
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${botToken}` },
		});
		if (!response.ok) {
			return null;
		}

		const parsed = slackUsersInfoSchema.safeParse(await response.json());
		if (!(parsed.success && parsed.data.ok) || !parsed.data.user) {
			return null;
		}

		const { user } = parsed.data;
		if (user.deleted || user.is_bot) {
			return null;
		}

		const email = user.profile?.email?.trim();
		return email ? email : null;
	} catch {
		return null;
	}
};
