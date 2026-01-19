import { ErrCode, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RewardService } from "@/internal/rewards/RewardService.js";

const DeleteCouponParamsSchema = z.object({
	id: z.string(),
});

export const handleDeleteCoupon = createRoute({
	params: DeleteCouponParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db } = ctx;
		const { id } = c.req.param();

		const stripeCli = createStripeCli({
			org,
			env,
		});

		const reward = await RewardService.get({
			db,
			idOrInternalId: id,
			orgId: org.id,
			env,
		});

		if (!reward) {
			throw new RecaseError({
				message: `Reward ${id} not found`,
				code: ErrCode.InvalidRequest,
				statusCode: 404,
			});
		}

		try {
			await stripeCli.coupons.del(reward.id);
		} catch (error) {
			console.log(
				`Failed to delete coupon from stripe: ${(error as { message: string }).message}`,
			);
		}

		await RewardService.delete({
			db,
			internalId: reward.internal_id,
			env,
			orgId: org.id,
		});

		return c.json({
			success: true,
			message: "Reward deleted successfully",
		});
	},
});
