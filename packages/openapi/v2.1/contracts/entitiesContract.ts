import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import {
	API_BALANCE_V1_EXAMPLE,
	ApiEntityV2Schema,
	CreateEntityParamsV1Schema,
	DeleteEntityParamsV0Schema,
	GetEntityParamsV0Schema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";
import {
	createEntityJsDoc,
	deleteEntityJsDoc,
	getEntityJsDoc,
} from "../jsDocs/entityJsDocs";

const API_ENTITY_V2_EXAMPLE = {
	id: "seat_42",
	name: "Seat 42",
	customer_id: "cus_123",
	feature_id: "seats",
	created_at: 1771409161016,
	env: "sandbox",
	subscriptions: [
		{
			plan_id: "pro_plan",
			auto_enable: true,
			add_on: false,
			status: "active",
			past_due: false,
			canceled_at: null,
			expires_at: null,
			trial_ends_at: null,
			started_at: 1771431921437,
			current_period_start: 1771431921437,
			current_period_end: 1771999921437,
			quantity: 1,
		},
	],
	purchases: [],
	balances: {
		messages: API_BALANCE_V1_EXAMPLE,
	},
	invoices: [],
};

export const createEntityContract = oc
	.route({
		method: "POST",
		path: "/v1/entities.create",
		operationId: "createEntity",
		tags: ["entities"],
		description: createEntityJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "create",
		}),
	})
	.input(
		CreateEntityParamsV1Schema.meta({
			title: "CreateEntityParams",
			examples: [
				{
					customer_id: "cus_123",
					entity_id: "seat_42",
					feature_id: "seats",
					name: "Seat 42",
				},
			],
		}),
	)
	.output(
		ApiEntityV2Schema.meta({
			examples: [API_ENTITY_V2_EXAMPLE],
		}),
	);

export const getEntityContract = oc
	.route({
		method: "POST",
		path: "/v1/entities.get",
		operationId: "getEntity",
		tags: ["entities"],
		description: getEntityJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "get",
		}),
	})
	.input(
		GetEntityParamsV0Schema.meta({
			title: "GetEntityParams",
			examples: [
				{
					entity_id: "seat_42",
				},
				{
					customer_id: "cus_123",
					entity_id: "seat_42",
				},
			],
		}),
	)
	.output(
		ApiEntityV2Schema.meta({
			examples: [API_ENTITY_V2_EXAMPLE],
		}),
	);

export const deleteEntityContract = oc
	.route({
		method: "POST",
		path: "/v1/entities.delete",
		operationId: "deleteEntity",
		tags: ["entities"],
		description: deleteEntityJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "delete",
		}),
	})
	.input(
		DeleteEntityParamsV0Schema.meta({
			title: "DeleteEntityParams",
			examples: [
				{
					customer_id: "cus_123",
					entity_id: "seat_42",
				},
			],
		}),
	)
	.output(
		SuccessResponseSchema.meta({
			examples: [{ success: true }],
		}),
	);
