import type { AttachDiscount } from "@autumn/shared";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";

export const legacyRewardToAttachDiscounts = ({
	attachParams,
}: {
	attachParams: AttachParams;
}): AttachDiscount[] | undefined =>
	attachParams.rewards?.map((reward) => ({
		reward_id: reward.id,
	}));
