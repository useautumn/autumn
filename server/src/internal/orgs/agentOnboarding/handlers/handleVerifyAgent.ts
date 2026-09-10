import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { verifyAgentAuthChallenge } from "../actions/verifyAgentAuthChallenge/verifyAgentAuthChallenge.js";

const VerifyAgentSchema = z.object({
	email: z.email(),
	otp: z.string().min(4).max(12),
});

export const handleVerifyAgent = createRoute({
	scopes: [Scopes.Public],
	body: VerifyAgentSchema,
	handler: async (c) => {
		const verified = await verifyAgentAuthChallenge({
			db: c.get("ctx").db,
			email: c.req.valid("json").email,
			otp: c.req.valid("json").otp,
		});

		return c.json({
			organization_id: verified.organization.id,
			organization_slug: verified.organization.slug,
			user_id: verified.user.id,
			email: verified.user.email,
		});
	},
});
