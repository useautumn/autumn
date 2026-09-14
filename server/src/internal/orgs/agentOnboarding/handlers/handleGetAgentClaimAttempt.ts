import { Scopes } from "@autumn/shared";
import { setCookie } from "hono/cookie";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getAgentClaimAttempt } from "../actions/getAgentClaimAttempt.js";
import {
	AGENT_CLAIM_ATTEMPT_TTL_MS,
	AGENT_CLAIM_INTENT_COOKIE,
	createAgentClaimIntent,
} from "../agentAuthUtils.js";
import {
	invalidAgentClaim,
	unauthenticatedAgentClaim,
} from "./agentClaimHandlerUtils.js";

const AgentClaimAttemptQuery = z.object({
	token: z.string().min(32).max(256),
});

export const handleGetAgentClaimAttempt = createRoute({
	scopes: [Scopes.Public],
	query: AgentClaimAttemptQuery,
	handler: async (c) => {
		const attemptToken = c.req.valid("query").token;
		const resolved = await getAgentClaimAttempt({
			db: c.get("ctx").db,
			attemptToken,
			headers: c.req.raw.headers,
		});
		if (resolved.kind === "unauthenticated") {
			setCookie(
				c,
				AGENT_CLAIM_INTENT_COOKIE,
				createAgentClaimIntent({ attemptToken }),
				{
					httpOnly: true,
					maxAge: Math.floor(AGENT_CLAIM_ATTEMPT_TTL_MS / 1000),
					path: "/",
					sameSite: "Lax",
					secure: new URL(c.req.url).protocol === "https:",
				},
			);
			throw unauthenticatedAgentClaim();
		}
		if (resolved.kind === "invalid") throw invalidAgentClaim();

		return c.json({
			status: "ready",
			organization: {
				id: resolved.organization.id,
				name: resolved.organization.name,
				slug: resolved.organization.slug,
			},
			email: resolved.attempt.email,
			expires_at: resolved.attempt.expiresAt,
		});
	},
});
