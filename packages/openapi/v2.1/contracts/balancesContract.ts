import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import {
	API_BALANCE_V1_EXAMPLE,
	CheckResponseV3Schema,
	CreateBalanceParamsV0Schema,
	ExtCheckParamsSchema,
	TrackParamsSchema,
	TrackResponseV3Schema,
	UpdateBalanceParamsV0Schema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";
import {
	balancesCheckJsDoc,
	balancesTrackJsDoc,
} from "../jsDocs/balancesJsDocs";

export const balancesCheckContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.check",
		operationId: "check",
		description: balancesCheckJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "check",
		}),
	})
	.input(
		ExtCheckParamsSchema.meta({
			title: "CheckParams",
			examples: [
				{
					customer_id: "cus_123",
					feature_id: "messages",
				},
				{
					customer_id: "cus_123",
					feature_id: "messages",
					required_balance: 3,
					send_event: true,
				},
			],
		}),
	)
	.output(
		CheckResponseV3Schema.meta({
			examples: [
				{
					allowed: true,
					customer_id: "cus_123",
					entity_id: null,
					required_balance: 1,
					balance: API_BALANCE_V1_EXAMPLE,
				},
			],
		}),
	);

export const balancesTrackContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.track",
		operationId: "track",
		description: balancesTrackJsDoc,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "track",
		}),
	})
	.input(
		TrackParamsSchema.meta({
			title: "TrackParams",
			examples: [
				{
					customer_id: "cus_123",
					feature_id: "messages",
					value: 1,
				},
			],
		}),
	)
	.output(
		TrackResponseV3Schema.meta({
			examples: [
				{
					customer_id: "cus_123",
					value: 1,
					balance: API_BALANCE_V1_EXAMPLE,
				},
			],
		}),
	);

export const balancesCreateContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.create",
		operationId: "createBalance",
		tags: ["balances"],
		description: "Create a balance for a customer feature.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "create",
		}),
	})
	.input(
		CreateBalanceParamsV0Schema.meta({
			title: "CreateBalanceParams",
			examples: [
				{
					customer_id: "cus_123",
					feature_id: "api_calls",
					included: 1000,
					reset: {
						interval: "month",
					},
				},
			],
		}),
	)
	.output(SuccessResponseSchema);

export const balancesUpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.update",
		operationId: "updateBalance",
		tags: ["balances"],
		description: "Update a customer balance.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "update",
		}),
	})
	.input(
		UpdateBalanceParamsV0Schema.meta({
			title: "UpdateBalanceParams",
			examples: [
				{
					customer_id: "cus_123",
					feature_id: "api_calls",
					remaining: 5,
				},
			],
		}),
	)
	.output(SuccessResponseSchema);
