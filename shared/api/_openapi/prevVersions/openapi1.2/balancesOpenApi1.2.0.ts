import { SuccessResponseSchema } from "../../../common/commonResponses.js";
import { CreateBalanceParamsSchema } from "../../../models.js";

export const balancesOpenApi = {
    "/balances/create": {
        post: {
            summary: "Create Balance",
            description:
                "Create a new balance for a specific feature for a customer.",
            tags: ["balances"],
            requestBody: {
                content: {
                    "application/json": { schema: CreateBalanceParamsSchema },
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
