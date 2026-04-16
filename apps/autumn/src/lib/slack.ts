import type { SlashCommandEvent } from "chat";

export function getWorkspaceId(event: SlashCommandEvent): string | null {
	return getWorkspaceIdFromRaw(event.raw);
}

export function getWorkspaceIdFromRaw(raw: unknown): string | null {
	if (!raw || typeof raw !== "object") return null;
	const obj = raw as Record<string, unknown>;

	// In Slack Connect channels, team/team_id is the sender's workspace, but
	// authorizations[0].team_id is the workspace where the bot is installed.
	// Check authorizations first so we always resolve to the installing workspace.
	if (Array.isArray(obj.authorizations) && obj.authorizations.length > 0) {
		const auth = obj.authorizations[0] as Record<string, unknown>;
		if (typeof auth.team_id === "string") return auth.team_id;
	}

	if (typeof obj.team_id === "string") return obj.team_id;

	if (typeof obj.team === "string") return obj.team;
	if (obj.team && typeof obj.team === "object") {
		const team = obj.team as Record<string, unknown>;
		if (typeof team.id === "string") return team.id;
	}

	if (typeof obj.teamId === "string") return obj.teamId;

	return null;
}

type AppError = {
	code?: string;
	message?: string;
	data?: { error?: string };
};

function coerceError(err: unknown): AppError {
	if (!err || typeof err !== "object") return {};
	return err as AppError;
}

export function isRedisUnavailable(err: unknown): boolean {
	const e = coerceError(err);
	return (
		e.code === "ECONNREFUSED" ||
		(typeof e.message === "string" && e.message.includes("ECONNREFUSED"))
	);
}

export function isSlackNotInChannel(err: unknown): boolean {
	const e = coerceError(err);
	return e.code === "slack_webapi_platform_error" && e.data?.error === "not_in_channel";
}
