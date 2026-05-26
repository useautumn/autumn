import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import {
	API_BALANCE_V1_EXAMPLE,
	CheckResponseV3Schema,
	CreateBalanceParamsV0Schema,
	DeleteBalanceParamsV0Schema,
	ExtCheckParamsSchema,
	FinalizeLockParamsV0Schema,
	TrackParamsSchema,
	TrackResponseV3Schema,
	TrackTokensParamsSchema,
	UpdateBalanceParamsV0Schema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";
import {
	balancesCheckJsDoc,
	balancesTrackJsDoc,
	balancesTrackTokensJsDoc,
} from "../jsDocs/balancesJsDocs";

type SpecWithResponses = {
	responses?: Record<string, object | undefined>;
};

const withAcceptedResponse = <TSpec extends SpecWithResponses>(
	spec: TSpec,
	nameOverride: string,
	description: string,
) => ({
	...spec,
	"x-speakeasy-name-override": nameOverride,
	responses: {
		...spec.responses,
		202: {
			...spec.responses?.["200"],
			description,
		},
	},
});

export const balancesCheckContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.check",
		operationId: "check",
		description: balancesCheckJsDoc,
		spec: (spec) =>
			withAcceptedResponse(
				spec,
				"check",
				"Accepted. Autumn is experiencing degraded service from a downstream provider, so access was allowed fail-open.",
			),
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
		spec: (spec) =>
			withAcceptedResponse(
				spec,
				"track",
				"Accepted. Autumn is experiencing degraded service from a downstream provider, so the event was accepted for replay and will be tracked as soon as the service is restored.",
			),
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
					deductions: [
						{
							balance_id: "cus_ent_3DdSDoyFmoA9Neecl2a2Gc507X2",
							feature_id: "messages",
							plan_id: "pro",
							reset: {
								interval: "month",
								resets_at: 1781288736881,
							},
							value: 1,
						},
					],
				},
			],
		}),
	);

export const balancesTrackTokensContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.track_tokens",
		operationId: "trackTokens",
		description: balancesTrackTokensJsDoc,
		spec: (spec) =>
			withAcceptedResponse(
				spec,
				"trackTokens",
				"Accepted. Autumn is experiencing degraded service from a downstream provider, so the token usage event was accepted for replay and will be tracked as soon as the service is restored.",
			),
	})
	.input(
		TrackTokensParamsSchema.meta({
			title: "TrackTokensParams",
			examples: [
				{
					customer_id: "cus_123",
					feature_id: "ai_credits",
					model_id: "anthropic/claude-sonnet-4-20250514",
					input_tokens: 1000,
					output_tokens: 500,
				},
			],
		}),
	)
	.output(
		TrackResponseV3Schema.meta({
			examples: [
				{
					customer_id: "cus_123",
					value: 0.006,
					balance: {
						...API_BALANCE_V1_EXAMPLE,
						feature_id: "ai_credits",
						granted: 10,
						remaining: 9.994,
						usage: 0.006,
					},
					deductions: [
						{
							balance_id: "cus_ent_3DdSDoyFmoA9Neecl2a2Gc507X2",
							feature_id: "ai_credits",
							plan_id: "pro",
							reset: {
								interval: "month",
								resets_at: 1781288736881,
							},
							value: 0.006,
						},
					],
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

export const balancesFinalizeContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.finalize",
		operationId: "finalizeLock",
		tags: ["balances"],
		description:
			"Finalize a previously locked balance. Use 'confirm' to commit the deduction, or 'release' to return the held balance.",
		spec: (spec) =>
			withAcceptedResponse(
				spec,
				"finalize",
				"Accepted. Autumn is experiencing degraded service from a downstream provider, so the finalize request was allowed fail-open.",
			),
	})
	.input(
		FinalizeLockParamsV0Schema.meta({
			title: "FinalizeBalanceParams",
			examples: [
				{
					lock_id: "lock_abc123",
					action: "confirm",
				},
				{
					lock_id: "lock_abc123",
					action: "confirm",
					override_value: 3,
				},
				{
					lock_id: "lock_abc123",
					action: "release",
				},
			],
		}),
	)
	.output(SuccessResponseSchema);

export const balancesDeleteContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.delete",
		operationId: "deleteBalance",
		tags: ["balances"],
		description:
			"Delete a balance for a customer feature. Can only delete a balance that is not attached to a price (eg. you cannot delete messages that have an overage price).",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "delete",
		}),
	})
	.input(
		DeleteBalanceParamsV0Schema.meta({
			title: "DeleteBalanceParams",
			examples: [
				{
					customer_id: "cus_123",
					feature_id: "api_calls",
				},
			],
		}),
	)
	.output(SuccessResponseSchema);
