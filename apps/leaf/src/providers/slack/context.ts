import { z } from "zod";

const slackWorkspaceSchema = z.preprocess(
	(value) => {
		const payload =
			value && typeof value === "object"
				? (value as Record<string, unknown>)
				: {};
		return {
			workspaceId:
				payload.team_id ??
				(payload.team as Record<string, unknown> | undefined)?.id ??
				(typeof payload.team === "string" ? payload.team : undefined) ??
				(payload.user as Record<string, unknown> | undefined)?.team_id,
		};
	},
	z.strictObject({ workspaceId: z.string() }),
);

export const getSlackWorkspaceId = (raw: unknown) =>
	slackWorkspaceSchema.parse(raw).workspaceId;
