import { DfuFlashParamsSchema, DfuFlashResultSchema } from "@autumn/shared";
import { oc } from "@orpc/contract";

export const dfuFlashContract = oc
	.route({
		method: "POST",
		path: "/v1/dfu.flash",
		operationId: "flash",
		tags: ["dfu"],
		description:
			"Image a customer into Autumn for live migration. Read-only against processors.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "flash",
		}),
	})
	.input(
		DfuFlashParamsSchema.meta({
			title: "DfuFlashParams",
			examples: [
				{
					customer_id: "cus_123",
					processors: [{ type: "stripe", id: "cus_stripe_123" }],
					billables: [
						{
							processor: "stripe",
							link: { subscription_id: "sub_123" },
							plan: {
								plan_id: "pro",
								status: "active",
								balances: [{ feature_id: "messages", usage: 10 }],
							},
						},
					],
				},
			],
		}),
	)
	.output(
		DfuFlashResultSchema.meta({
			title: "DfuFlashResult",
			examples: [
				{
					customer_id: "cus_123",
					flashed: [
						{
							plan_id: "pro",
							processor: "stripe",
							customer_product_id: "cus_prod_123",
							status: "active",
							skipped: false,
						},
					],
				},
			],
		}),
	);
