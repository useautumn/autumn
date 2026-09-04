import {
	CreatePlanParamsV2Schema,
	DeletePlanParamsV2Schema,
	GetPlanParamsV0Schema,
	UpdatePlanParamsV2Schema,
} from "@autumn/shared";
import { createJSDocDescription, example } from "../../utils/jsDocs/index.js";

export const listPlansJsDoc = createJSDocDescription({
	description: "Lists all plans in the current environment.",
	whenToUse:
		"Use this to retrieve all plans for displaying pricing pages or managing plan configurations.",
	examples: [],
	methodName: "plans.list",
	returns: "A list of all plans with their pricing and feature configurations.",
});

export const getPlanJsDoc = createJSDocDescription({
	description: "Retrieves a single plan by its ID.",
	whenToUse:
		"Use this to fetch the full configuration of a specific plan, including its features and pricing.",
	body: GetPlanParamsV0Schema,
	examples: [
		example({
			description: "Get a plan by ID",
			values: {
				planId: "pro_plan",
			},
		}),
		example({
			description: "Get a specific version of a plan",
			values: {
				planId: "pro_plan",
				version: 2,
			},
		}),
	],
	methodName: "plans.get",
	returns: "The plan object with its full configuration.",
});

export const createPlanJsDoc = createJSDocDescription({
	description:
		"Creates a new plan with optional base price and feature configurations.",
	whenToUse:
		"Use this to programmatically create pricing plans. See [How plans work](/documentation/pricing/plans) for concepts.",
	body: CreatePlanParamsV2Schema,
	examples: [
		example({
			description: "Create a free plan with limited features",
			values: {
				planId: "free_plan",
				name: "Free",
				autoEnable: true,
				items: [
					{
						featureId: "messages",
						included: 100,
						reset: { interval: "month" },
					},
				],
			},
		}),
		example({
			description: "Create a paid plan with base price and usage-based feature",
			values: {
				planId: "pro_plan",
				name: "Pro Plan",
				price: {
					amount: 10,
					interval: "month",
				},
				items: [
					{
						featureId: "messages",
						included: 1000,
						reset: { interval: "month" },
						price: {
							amount: 0.01,
							interval: "month",
							billingUnits: 1,
							billingMethod: "usage_based",
						},
					},
				],
			},
		}),
		example({
			description: "Create a plan with prepaid seats",
			values: {
				planId: "team_plan",
				name: "Team Plan",
				price: {
					amount: 49,
					interval: "month",
				},
				items: [
					{
						featureId: "seats",
						included: 5,
						price: {
							amount: 10,
							interval: "month",
							billingUnits: 1,
							billingMethod: "prepaid",
						},
					},
				],
			},
		}),
		example({
			description: "Create an add-on plan",
			values: {
				planId: "analytics_addon",
				name: "Advanced Analytics",
				addOn: true,
				price: {
					amount: 20,
					interval: "month",
				},
			},
		}),
		example({
			description: "Create a plan with tiered pricing",
			values: {
				planId: "api_plan",
				name: "API Plan",
				items: [
					{
						featureId: "api_calls",
						included: 1000,
						reset: { interval: "month" },
						price: {
							tiers: [
								{ to: 10000, amount: 0.001 },
								{ to: 100000, amount: 0.0005 },
								{ to: "inf", amount: 0.0001 },
							],
							interval: "month",
							billingUnits: 1,
							billingMethod: "usage_based",
						},
					},
				],
			},
		}),
		example({
			description: "Create a plan with free trial",
			values: {
				planId: "premium_plan",
				name: "Premium",
				price: {
					amount: 99,
					interval: "month",
				},
				freeTrial: {
					durationLength: 14,
					durationType: "day",
					cardRequired: true,
				},
			},
		}),
	],
	methodName: "plans.create",
	returns: "The created plan object.",
});

export const updatePlanJsDoc = createJSDocDescription({
	description:
		"Updates an existing plan. Creates a new version unless `disableVersion` is set.",
	whenToUse:
		"Use this to modify plan properties, pricing, or feature configurations. See [Adding features to plans](/documentation/pricing/plan-features) for item configuration.",
	body: UpdatePlanParamsV2Schema,
	examples: [
		example({
			description: "Update plan name and price",
			values: {
				planId: "pro_plan",
				name: "Pro Plan (Updated)",
				price: {
					amount: 15,
					interval: "month",
				},
			},
		}),
		example({
			description: "Add a feature to an existing plan",
			values: {
				planId: "pro_plan",
				items: [
					{
						featureId: "messages",
						included: 1000,
						reset: { interval: "month" },
					},
					{
						featureId: "storage",
						included: 10,
						reset: { interval: "month" },
					},
				],
			},
		}),
		example({
			description: "Remove the base price (make usage-only)",
			values: {
				planId: "pro_plan",
				price: null,
			},
		}),
		example({
			description: "Archive a plan",
			values: {
				planId: "old_plan",
				archived: true,
			},
		}),
		example({
			description: "Update feature's included amount",
			values: {
				planId: "pro_plan",
				items: [
					{
						featureId: "messages",
						included: 2000,
						reset: { interval: "month" },
					},
				],
			},
		}),
	],
	methodName: "plans.update",
	returns: "The updated plan object.",
});

export const deletePlanJsDoc = createJSDocDescription({
	description: "Deletes a plan by its ID.",
	whenToUse:
		"Use this to permanently remove a plan. Plans with active customers cannot be deleted - archive them instead.",
	body: DeletePlanParamsV2Schema,
	examples: [
		example({
			description: "Delete a plan",
			values: {
				planId: "unused_plan",
			},
		}),
		example({
			description: "Delete all versions of a plan",
			values: {
				planId: "legacy_plan",
				allVersions: true,
			},
		}),
	],
	methodName: "plans.delete",
	returns: "A success flag indicating the plan was deleted.",
});
