import type { ZodOpenApiPathsObject } from "zod-openapi";
import { SuccessResponseSchema } from "../../../common/commonResponses.js";
import { CreateBalanceParamsV0Schema } from "../../../models.js";
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
						schema: CreateBalanceParamsV0Schema,
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
