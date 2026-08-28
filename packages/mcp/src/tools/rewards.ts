import { CreateRewardParamsSchema } from "@autumn/shared/publicApiSchemas";
import * as z from "zod/v4";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const endpoints = {
	listRewards: "/v1/rewards.list",
	createReward: "/v1/rewards.create",
} as const;

const schemas = {
	listRewards: z.object({}).strict(),
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
			id: "createReward",
			description:
				"Create a coupon or feature grant. Destructive configuration write: follow the Rewards resource and confirm the complete reward first.",
			destructive: true,
		}),
	],
} satisfies ToolDomain;

export const rewards = { endpoints, schemas, domain };
