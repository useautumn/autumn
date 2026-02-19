import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import {
	API_PLAN_V1_EXAMPLE,
	ApiPlanV1WithMeta,
} from "@api/products/apiPlanV1.js";
import {
	CreatePlanParamsV2Schema,
	DeletePlanParamsV2Schema,
	GetPlanParamsV0Schema,
	getListResponseSchema,
	ListPlanParamsSchema,
	UpdatePlanParamsV2Schema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";
import {
	createPlanJsDoc,
	deletePlanJsDoc,
	getPlanJsDoc,
	listPlansJsDoc,
	updatePlanJsDoc,
} from "../jsDocs/planJsDocs.js";

export const listPlansContract = oc
	.route({
		method: "POST",
		path: "/v1/plans.list",
		operationId: "listPlans",
		summary: "List all plans",
		description: listPlansJsDoc,
		tags: ["plans"],
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "list",
		}),
	})
	.input(
		ListPlanParamsSchema.meta({
			title: "ListPlansParams",
			examples: [{}, { customer_id: "cus_123" }, { include_archived: true }],
		}),
	)
	.output(
		getListResponseSchema({ schema: ApiPlanV1WithMeta }).meta({
			examples: [
				{
					list: [API_PLAN_V1_EXAMPLE],
				},
			],
		}),
	);

export const getPlanContract = oc
	.route({
		method: "POST",
		path: "/v1/plans.get",
		operationId: "getPlan",
		summary: "Get a plan",
		description: getPlanJsDoc,
		tags: ["plans"],
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "get",
		}),
	})
	.input(
		GetPlanParamsV0Schema.meta({
			title: "GetPlanParams",
			examples: [{ plan_id: "pro_plan" }, { plan_id: "pro_plan", version: 2 }],
		}),
	)
	.output(
		ApiPlanV1WithMeta.meta({
			examples: [API_PLAN_V1_EXAMPLE],
		}),
	);

export const createPlanContract = oc
	.route({
		method: "POST",
		path: "/v1/plans.create",
		operationId: "createPlan",
		summary: "Create a plan",
		description: createPlanJsDoc,
		tags: ["plans"],
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "create",
		}),
	})
	.input(
		CreatePlanParamsV2Schema.meta({
			title: "CreatePlanParams",
			examples: [
				{
					plan_id: "free_plan",
					name: "Free",
					auto_enable: true,
					items: [
						{
							feature_id: "messages",
							included: 100,
							reset: { interval: "month" },
						},
					],
				},
				{
					plan_id: "pro_plan",
					name: "Pro Plan",
					price: { amount: 10, interval: "month" },
					items: [
						{
							feature_id: "messages",
							included: 1000,
							reset: { interval: "month" },
							price: {
								amount: 0.01,
								interval: "month",
								billing_units: 1,
								billing_method: "usage_based",
							},
						},
					],
				},
				{
					plan_id: "team_plan",
					name: "Team Plan",
					price: { amount: 49, interval: "month" },
					items: [
						{
							feature_id: "seats",
							included: 5,
							price: {
								amount: 10,
								interval: "month",
								billing_units: 1,
								billing_method: "prepaid",
							},
						},
					],
				},
			],
		}),
	)
	.output(
		ApiPlanV1WithMeta.meta({
			examples: [API_PLAN_V1_EXAMPLE],
		}),
	);

export const updatePlanContract = oc
	.route({
		method: "POST",
		path: "/v1/plans.update",
		operationId: "updatePlan",
		summary: "Update a plan",
		description: updatePlanJsDoc,
		tags: ["plans"],
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "update",
		}),
	})
	.input(
		UpdatePlanParamsV2Schema.meta({
			title: "UpdatePlanParams",
			examples: [
				{
					plan_id: "pro_plan",
					name: "Pro Plan (Updated)",
					price: { amount: 15, interval: "month" },
				},
				{
					plan_id: "pro_plan",
					price: null,
				},
				{
					plan_id: "old_plan",
					archived: true,
				},
			],
		}),
	)
	.output(
		ApiPlanV1WithMeta.meta({
			examples: [API_PLAN_V1_EXAMPLE],
		}),
	);

export const deletePlanContract = oc
	.route({
		method: "POST",
		path: "/v1/plans.delete",
		operationId: "deletePlan",
		summary: "Delete a plan",
		description: deletePlanJsDoc,
		tags: ["plans"],
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "delete",
		}),
	})
	.input(
		DeletePlanParamsV2Schema.meta({
			title: "DeletePlanParams",
			examples: [
				{ plan_id: "unused_plan" },
				{ plan_id: "legacy_plan", all_versions: true },
			],
		}),
	)
	.output(SuccessResponseSchema);
