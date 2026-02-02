import type { ZodOpenApiPathsObject } from "zod-openapi";
import { SuccessResponseSchema } from "../../../common/commonResponses.js";
import { CreateBalanceParamsSchema } from "../../../models.js";
import { xCodeSamplesLegacy } from "../../../utils/xCodeSamplesLegacy.js";

export const balancesOpenApi: ZodOpenApiPathsObject = {
	"/balances/create": {
		post: {
			summary: "Create Balance",
			description:
				"Create a new balance for a specific feature for a customer.",
			tags: ["balances"],
			requestBody: {
				content: {
					"application/json": {
						schema: CreateBalanceParamsSchema,
					},
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

			"x-codeSamples": xCodeSamplesLegacy({
				methodPath: "balances.create",
				example: {
					customer_id: "cus_123",
					feature_id: "api_tokens",
					granted_balance: 100,
					reset: {
						interval: "month",
					},
				},
			}),
		},
	},
};
