import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { rewardApplyToFacts } from "@/internal/approvals/facts/rewards/rewardApplyToFacts";
import { CusService } from "@/internal/customers/CusService";
import { checkRouteApproval } from "./checkRouteApproval";

/** Applying a reward or coupon to a customer, judged on which reward it is. */
export const checkRewardApplyApproval = ({
	ctx,
	customerId,
	rewardId,
}: {
	ctx: AutumnContext;
	customerId: string;
	rewardId: string;
}) =>
	checkRouteApproval({
		ctx,
		action: "rewards.apply",
		buildFacts: async () =>
			rewardApplyToFacts({
				fullCustomer: await CusService.getFull({
					ctx,
					idOrInternalId: customerId,
				}),
				rewardId,
			}),
	});
