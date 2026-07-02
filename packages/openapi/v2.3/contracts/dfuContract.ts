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
					customer: {
						id: "cus_123",
						name: "Jane Doe",
						email: "jane@example.com",
						createdAt: 1771409161016,
						fingerprint: null,
						stripeId: "cus_stripe_123",
						processors: { stripe: { id: "cus_stripe_123" } },
						env: "sandbox",
						metadata: {},
						sendEmailReceipts: false,
						billingControls: { autoTopups: [] },
						subscriptions: [
							{
								planId: "pro",
								autoEnable: false,
								addOn: false,
								status: "active",
								pastDue: false,
								canceledAt: null,
								expiresAt: null,
								trialEndsAt: null,
								startedAt: 1771431921437,
								currentPeriodStart: 1771431921437,
								currentPeriodEnd: 1771999921437,
								quantity: 1,
							},
						],
						purchases: [],
						balances: {
							messages: {
								featureId: "messages",
								granted: 100,
								remaining: 90,
								usage: 10,
								unlimited: false,
								overageAllowed: false,
								maxPurchase: null,
								nextResetAt: 1773851121437,
								breakdown: [
									{
										id: "cus_ent_39qmLooixXLAqMywgXywjAz96rV",
										planId: "pro",
										includedGrant: 100,
										prepaidGrant: 0,
										remaining: 90,
										usage: 10,
										unlimited: false,
										reset: { interval: "month", resetsAt: 1773851121437 },
										price: null,
										expiresAt: null,
									},
								],
							},
						},
						flags: {},
						config: {
							disable_pooled_balance: false,
							disable_overage_billing: false,
						},
					},
				},
			],
		}),
	);
