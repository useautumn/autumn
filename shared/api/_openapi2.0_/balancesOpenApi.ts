import { CreateBalanceSchema } from "@api/balances/create/createBalanceParams.js";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { ExtBalancesUpdateParamsSchema } from "../balances/balancesUpdateModels.js";
import { SuccessResponseSchema } from "../common/commonResponses.js";

export const balancesOpenApi: ZodOpenApiPathsObject = {
	"/balances/update": {
		post: {
			summary: "Update Balance",
			description:
				"Update or set the balance or usage for a specific feature for a customer. Either current_balance or usage must be provided, but not both.",
			tags: ["balances"],
			requestBody: {
				content: {
					"application/json": { schema: ExtBalancesUpdateParamsSchema },
				},
			},
			responses: {
				"200": {
					description: "Balance updated successfully",
					content: {
						"application/json": { schema: SuccessResponseSchema },
					},
				},
			},
		},
	},
	"/balances/create": {
		post: {
			summary: "Create Balance",
			description:
				"Create a new balance for a specific feature for a customer.",
			tags: ["balances"],
			requestBody: {
				content: {
					"application/json": { schema: CreateBalanceSchema },
				},
			},
			responses: {
				"200": {
					description: "Balance created successfully",
					content: {
						"application/json": { schema: SuccessResponseSchema },
					},
				},
			},
		},
	},
};
