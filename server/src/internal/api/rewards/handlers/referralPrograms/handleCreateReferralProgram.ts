import { CreateReferralProgramParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createApiReferralProgram } from "@/internal/rewards/actions/createApiReferralProgram.js";

export const handleCreateReferralProgram = createRoute({
	scopes: [Scopes.Rewards.Write],
	body: CreateReferralProgramParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const referralProgram = await createApiReferralProgram({ ctx, params });

		return c.json(referralProgram);
	},
});
