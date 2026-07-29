import { ApiRewardsListV0Schema } from "./rewardsListOpModels.js";

export const rewardOps = {
	"/rewards.list": {
		post: {
			summary: "List Rewards",
			tags: ["rewards"],
			responses: {
				"200": {
					description: "The org's coupons and feature grants.",
					content: {
						"application/json": { schema: ApiRewardsListV0Schema },
					},
				},
			},
		},
	},
};
