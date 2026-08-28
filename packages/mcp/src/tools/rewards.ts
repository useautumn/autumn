import { CreateRewardParamsSchema } from "@autumn/shared/publicApiSchemas";
import * as z from "zod/v4";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const endpoints = {
	listRewards: "/v1/rewards.list",
	previewCreateReward: "/v1/rewards.preview_create",
	createReward: "/v1/rewards.create",
} as const;

const schemas = {
	listRewards: z.object({}).strict(),
	previewCreateReward: CreateRewardParamsSchema,
	createReward: CreateRewardParamsSchema,
} as const;

const { operation } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "listRewards",
			description:
				"List coupons and feature grants. Follow the Rewards resource for reward shapes and semantics.",
		}),
		operation({
			id: "previewCreateReward",
			description:
				"Preview a coupon or feature grant WITHOUT creating it. Returns the resolved reward change the approval/confirmation surface renders; pass the same params you would pass to createReward.",
		}),
		operation({
			id: "createReward",
			description:
				"Create a coupon or feature grant. Destructive configuration write: call previewCreateReward with the same params immediately before this, and follow the Rewards resource.",
			destructive: true,
		}),
	],
} satisfies ToolDomain;

export const rewards = { endpoints, schemas, domain };
