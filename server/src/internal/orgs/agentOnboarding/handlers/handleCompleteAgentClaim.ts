import { Scopes } from "@autumn/shared";
import { deleteCookie } from "hono/cookie";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { completeAgentClaim } from "../actions/completeAgentClaim.js";
import { AGENT_CLAIM_INTENT_COOKIE } from "../agentAuthUtils.js";
import {
	invalidAgentClaim,
	unauthenticatedAgentClaim,
} from "./agentClaimHandlerUtils.js";

const CompleteAgentClaimSchema = z.object({
	token: z.string().min(32).max(256),
});

export const handleCompleteAgentClaim = createRoute({
	scopes: [Scopes.Public],
	body: CompleteAgentClaimSchema,
	handler: async (c) => {
		const completed = await completeAgentClaim({
			db: c.get("ctx").db,
			attemptToken: c.req.valid("json").token,
			headers: c.req.raw.headers,
		});
		if (completed.kind === "unauthenticated") {
			throw unauthenticatedAgentClaim();
		}
		if (completed.kind !== "claimed") throw invalidAgentClaim();

		deleteCookie(c, AGENT_CLAIM_INTENT_COOKIE, { path: "/" });
		return c.json({
			organization_id: completed.organization.id,
			organization_slug: completed.organization.slug,
			user_id: completed.user.id,
			email: completed.user.email,
		});
	},
});
