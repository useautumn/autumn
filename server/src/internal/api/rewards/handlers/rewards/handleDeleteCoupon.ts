import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";

const DeleteCouponParamsSchema = z.object({
	id: z.string(),
});

export const handleDeleteCoupon = createRoute({
	scopes: [Scopes.Rewards.Write],
	params: DeleteCouponParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db, logger } = ctx;
		const { id } = c.req.param();

		const stripeCli = createStripeCli({
			org,
			env,
		});

		const reward = await rewardRepo.get({
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
			logger.warn(
				`Failed to delete coupon from stripe: ${(error as { message: string }).message}`,
				{ rewardId: reward.id, error },
			);
		}

		// Delete the DB row first: if it fails, the create-side duplicate guard must
		// still see the reward as alive, so we keep its promo codes active too.
		await rewardRepo.delete({
			db,
			internalId: reward.internal_id,
			env,
			orgId: org.id,
		});

		// Deactivate this reward's promo codes so the code is free to reuse, even if
		// the coupon deletion above failed (a stale active promo blocks recreation).
		for (const promoCode of reward.promo_codes ?? []) {
			try {
				for await (const promo of stripeCli.promotionCodes.list({
					code: promoCode.code,
					coupon: reward.id,
					active: true,
					limit: 100,
				})) {
					// Isolate each update so one failure doesn't skip the remaining
					// promos for this code (a stale active one blocks recreation).
					try {
						await stripeCli.promotionCodes.update(promo.id, { active: false });
					} catch (error) {
						logger.warn(
							`Failed to deactivate promo code ${promoCode.code} (${promo.id}) in stripe after deleting reward ${reward.id}`,
							{ rewardId: reward.id, code: promoCode.code, promoId: promo.id, error },
						);
					}
				}
			} catch (error) {
				logger.warn(
					`Failed to list promo codes for ${promoCode.code} in stripe after deleting reward ${reward.id}`,
					{ rewardId: reward.id, code: promoCode.code, error },
				);
			}
		}

		return c.json({
			success: true,
			message: "Reward deleted successfully",
		});
	},
});
