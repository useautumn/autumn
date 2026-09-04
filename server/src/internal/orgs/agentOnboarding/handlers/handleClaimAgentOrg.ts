import { getBearerToken } from "@autumn/auth";
import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { startAgentAuthChallenge } from "../actions/startAgentAuthChallenge/startAgentAuthChallenge.js";

const ClaimAgentOrgSchema = z.object({
	claim_token: z.string().min(32).max(256).optional(),
	email: z.email(),
});

export const handleClaimAgentOrg = createRoute({
	scopes: [Scopes.Public],
	body: ClaimAgentOrgSchema,
	handler: async (c) => {
		const { email, claim_token } = c.req.valid("json");
		const setupKey = getBearerToken({ headers: c.req.raw.headers });
		if (Boolean(claim_token) === Boolean(setupKey)) {
			throw new RecaseError({
				message: "Claim could not be completed",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const challenge = await startAgentAuthChallenge({
			db: c.get("ctx").db,
			claimToken: claim_token,
			setupKey,
			email,
		});
		if (!challenge) {
			throw new RecaseError({
				message: "Claim could not be completed",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		return c.json({
			expires_at: challenge.expiresAt.toISOString(),
		});
	},
});
