import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import {
	ApiFeatureV1Schema,
	CreateFeatureV2ParamsSchema,
	DeleteFeatureV1ParamsSchema,
	GetFeatureParamsSchema,
	getListResponseSchema,
	UpdateFeatureV2ParamsSchema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";
import {
	createFeatureJsDoc,
	deleteFeatureJsDoc,
	getFeatureJsDoc,
	listFeaturesJsDoc,
	updateFeatureJsDoc,
} from "../jsDocs/featureJsDocs.js";

const API_FEATURE_EXAMPLE = {
	id: "api-calls",
	name: "API Calls",
	type: "metered",
	consumable: true,
	archived: false,
	display: {
		singular: "API call",
		plural: "API calls",
	},
};

const API_FEATURE_CREDIT_SYSTEM_EXAMPLE = {
	id: "credits",
	name: "Credits",
	type: "credit_system",
	consumable: true,
	archived: false,
	credit_schema: [
		{ metered_feature_id: "api-calls", credit_cost: 1 },
		{ metered_feature_id: "image-generations", credit_cost: 10 },
	],
	display: {
		singular: "credit",
		plural: "credits",
	},
};

export const listFeaturesContract = oc
	.route({
		method: "POST",
		path: "/v1/features.list",
		operationId: "listFeatures",
		tags: ["features"],
		description: listFeaturesJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "list",
		}),
	})
	.output(
		getListResponseSchema({ schema: ApiFeatureV1Schema }).meta({
			examples: [
				{
					list: [API_FEATURE_EXAMPLE, API_FEATURE_CREDIT_SYSTEM_EXAMPLE],
				},
			],
		}),
	);

export const getFeatureContract = oc
	.route({
		method: "POST",
		path: "/v1/features.get",
		operationId: "getFeature",
		tags: ["features"],
		description: getFeatureJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "get",
		}),
	})
	.input(
		GetFeatureParamsSchema.meta({
			title: "GetFeatureParams",
			examples: [
				{
					feature_id: "api-calls",
				},
			],
		}),
	)
	.output(
		ApiFeatureV1Schema.meta({
			examples: [API_FEATURE_EXAMPLE],
		}),
	);

export const createFeatureContract = oc
	.route({
		method: "POST",
		path: "/v1/features.create",
		operationId: "createFeature",
		tags: ["features"],
		description: createFeatureJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "create",
		}),
	})
	.input(
		CreateFeatureV2ParamsSchema.meta({
			title: "CreateFeatureParams",
			examples: [
				{
					feature_id: "api-calls",
					name: "API Calls",
					type: "metered",
					consumable: true,
				},
				{
					feature_id: "credits",
					name: "Credits",
					type: "credit_system",
					consumable: true,
					credit_schema: [
						{ metered_feature_id: "api-calls", credit_cost: 1 },
						{ metered_feature_id: "image-generations", credit_cost: 10 },
					],
				},
			],
		}),
	)
	.output(
		ApiFeatureV1Schema.meta({
			examples: [API_FEATURE_EXAMPLE],
		}),
	);

export const updateFeatureContract = oc
	.route({
		method: "POST",
		path: "/v1/features.update",
		operationId: "updateFeature",
		tags: ["features"],
		description: updateFeatureJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "update",
		}),
	})
	.input(
		UpdateFeatureV2ParamsSchema.meta({
			title: "UpdateFeatureParams",
			examples: [
				{
					feature_id: "api-calls",
					name: "API Requests",
					display: {
						singular: "API request",
						plural: "API requests",
					},
				},
				{
					feature_id: "old-feature",
					archived: true,
				},
			],
		}),
	)
	.output(
		ApiFeatureV1Schema.meta({
			examples: [API_FEATURE_EXAMPLE],
		}),
	);

export const deleteFeatureContract = oc
	.route({
		method: "POST",
		path: "/v1/features.delete",
		operationId: "deleteFeature",
		tags: ["features"],
		description: deleteFeatureJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "delete",
		}),
	})
	.input(
		DeleteFeatureV1ParamsSchema.meta({
			title: "DeleteFeatureParams",
			examples: [
				{
					feature_id: "old-feature",
				},
			],
		}),
	)
	.output(
		SuccessResponseSchema.meta({
			examples: [{ success: true }],
		}),
	);
