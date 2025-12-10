import { UpdateBalanceParamsSchema } from "@api/models.js";
import type { ZodOpenApiPathsObject } from "zod-openapi";
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
					"application/json": { schema: UpdateBalanceParamsSchema },
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
};
