import {
	DeleteReferralProgramParamsSchema,
	GetReferralProgramParamsSchema,
	ReferralProgramsListParamsSchema,
	Scopes,
	UpdateReferralProgramParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	deleteApiReferralProgram,
	getApiReferralProgramById,
	listApiReferralPrograms,
	updateApiReferralProgram,
} from "@/internal/rewards/actions/apiReferralPrograms.js";
import { rewardMutationLock } from "@/internal/rewards/rewardLock.js";

export { handleCreateReferralProgram } from "./handleCreateReferralProgram.js";

export const handleListReferralPrograms = createRoute({
	scopes: [Scopes.Rewards.Read],
	body: ReferralProgramsListParamsSchema,
	handler: async (c) =>
		c.json(await listApiReferralPrograms({ ctx: c.get("ctx") })),
});

export const handleGetReferralProgram = createRoute({
	scopes: [Scopes.Rewards.Read],
	body: GetReferralProgramParamsSchema,
	handler: async (c) =>
		c.json(
			await getApiReferralProgramById({
				ctx: c.get("ctx"),
				params: c.req.valid("json"),
			}),
		),
});

export const handleUpdateReferralProgram = createRoute({
	scopes: [Scopes.Rewards.Write],
	body: UpdateReferralProgramParamsSchema,
	lock: rewardMutationLock,
	handler: async (c) =>
		c.json(
			await updateApiReferralProgram({
				ctx: c.get("ctx"),
				params: c.req.valid("json"),
			}),
		),
});

export const handleDeleteReferralProgram = createRoute({
	scopes: [Scopes.Rewards.Write],
	body: DeleteReferralProgramParamsSchema,
	lock: rewardMutationLock,
	handler: async (c) =>
		c.json(
			await deleteApiReferralProgram({
				ctx: c.get("ctx"),
				params: c.req.valid("json"),
			}),
		),
});
