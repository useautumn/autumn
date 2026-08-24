import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { generateBillingRequest } from "@/internal/billing/v2/actions/generateRequest/generateBillingRequest";
import { GENERATE_BILLING_TOOLS } from "@/internal/billing/v2/actions/generateRequest/generationSchemas";

const GenerateBillingRequestParamsSchema = z.object({
	current_request: z.record(z.string(), z.unknown()).optional().meta({
		description:
			"The request currently seeded in the sheet. When present, generation edits it instead of starting from scratch.",
	}),
	customer_id: z.string().min(1).meta({
		description: "The ID of the customer the generated request targets.",
	}),
	customer_product_id: z.string().optional().meta({
		description:
			"For update_subscription: the customer product the sheet is anchored to.",
	}),
	prompt: z.string().min(1).max(2000).meta({
		description: "Natural-language description of the billing change.",
	}),
	tool: z.enum(GENERATE_BILLING_TOOLS).meta({
		description: "Which billing operation to generate parameters for.",
	}),
});

export const handleGenerateBillingRequest = createRoute({
	scopes: [Scopes.Billing.Read],
	body: GenerateBillingRequestParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const { request, unrepresentable } = await generateBillingRequest({
			ctx,
			params,
		});

		return c.json(
			{
				object: "billing_request_generation",
				request,
				tool: params.tool,
				unrepresentable,
			},
			200,
		);
	},
});
