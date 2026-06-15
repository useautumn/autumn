import { RecaseError } from "../../api/errors/base/RecaseError.js";
import { ErrCode } from "../../enums/ErrCode.js";
import type { PromoCode } from "../../models/rewardModels/rewardModels/rewardModels.js";

const ALPHANUMERIC_REGEX = /^[a-zA-Z0-9]+$/;
const MAX_PROMO_CODE_LENGTH = 500;

export const getGlobalMaxRedemption = (
	promoCode: Pick<PromoCode, "global_max_redemption" | "max_redemptions">,
) => promoCode.global_max_redemption ?? promoCode.max_redemptions;

export const normalizePromoCodes = (promoCodes: PromoCode[]): PromoCode[] => {
	const normalized = promoCodes
		.filter((promoCode) => promoCode.code.length > 0)
		.map(({ max_redemptions, global_max_redemption, ...promoCode }) => {
			const globalMaxRedemption = global_max_redemption ?? max_redemptions;
			return {
				...promoCode,
				...(globalMaxRedemption !== undefined
					? { global_max_redemption: globalMaxRedemption }
					: {}),
			};
		});

	for (const promoCode of normalized) {
		if (!ALPHANUMERIC_REGEX.test(promoCode.code)) {
			throw new RecaseError({
				message:
					"Promotional code can only contain letters and numbers (a-z, A-Z, 0-9)",
				code: ErrCode.InvalidReward,
			});
		}
		if (promoCode.code.length > MAX_PROMO_CODE_LENGTH) {
			throw new RecaseError({
				message: "Promotional code cannot exceed 500 characters",
				code: ErrCode.InvalidReward,
			});
		}
		if (
			promoCode.global_max_redemption !== undefined &&
			(!Number.isInteger(promoCode.global_max_redemption) ||
				promoCode.global_max_redemption < 1)
		) {
			throw new RecaseError({
				message: "Max redemptions must be a positive whole number",
				code: ErrCode.InvalidReward,
			});
		}
	}

	return normalized;
};
