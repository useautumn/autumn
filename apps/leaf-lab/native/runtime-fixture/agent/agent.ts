import { defineAgent } from "eve";
import { mockModel } from "eve/evals";

const request = {
	customer_id: "gen-attach-multi",
	plan_id: "pro_gen-attach-multi",
	customize: { price: { amount: 1035, interval: "month" } },
};

export default defineAgent({
	modelContextWindowTokens: 1_000_000,
	model: mockModel(({ lastUserMessage, toolResults }) => {
		const completed = (id: string) =>
			toolResults.some((result) => result.id === id);
		if (lastUserMessage === "question")
			return "The original $1,035/month proposal remains unchanged and unexecuted.";
		if (lastUserMessage === "refine") {
			if (!completed("cancel-old"))
				return {
					toolCalls: [
						{
							name: "supersede_approval",
							id: "cancel-old",
							input: {
								call_id: "old-write",
								reason: "User explicitly requested a 14-day trial refinement",
							},
						},
					],
				};
			const changed = {
				...request,
				free_trial: {
					duration_length: 14,
					duration_type: "day",
					card_required: false,
				},
			};
			if (!completed("preview-new"))
				return {
					toolCalls: [
						{
							name: "autumn__previewAttach",
							id: "preview-new",
							input: { request: changed, intent: "Preview refined terms" },
						},
					],
				};
			return {
				toolCalls: [
					{
						name: "autumn__attach",
						id: "new-write",
						input: {
							request: changed,
							intent: "Propose refined terms",
							approval_description:
								"Updated proposal with a 14-day trial at $1,035/month.",
						},
					},
				],
			};
		}
		if (!completed("lookup"))
			return {
				toolCalls: [
					{
						name: "autumn__getCustomer",
						id: "lookup",
						input: {
							request: { customer_id: request.customer_id },
							intent: "Read customer",
						},
					},
				],
			};
		if (!completed("preview-old"))
			return {
				toolCalls: [
					{
						name: "autumn__previewAttach",
						id: "preview-old",
						input: { request, intent: "Preview original terms" },
					},
				],
			};
		return {
			toolCalls: [
				{
					name: "autumn__attach",
					id: "old-write",
					input: {
						request,
						intent: "Propose original terms",
						approval_description: "Pro at a custom $1,035/month.",
					},
				},
			],
		};
	}),
});
