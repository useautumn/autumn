import { SuccessResponseSchema } from "@api/common/commonResponses.js";
import {
	CheckResponseV3Schema,
	CreateBalanceParamsV0Schema,
	ExtCheckParamsSchema,
	TrackParamsSchema,
	TrackResponseV3Schema,
	UpdateBalanceParamsSchema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";

export const balancesCreateContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.create",
		operationId: "balancesCreate",
		tags: ["balances"],
		description: "Create a balance for a customer feature.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "create",
		}),
	})
	.input(CreateBalanceParamsV0Schema)
	.output(SuccessResponseSchema);

export const balancesUpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.update",
		operationId: "balancesUpdate",
		tags: ["balances"],
		description: "Update a customer balance.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "update",
		}),
	})
	.input(UpdateBalanceParamsSchema)
	.output(SuccessResponseSchema);

export const balancesCheckContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.check",
		operationId: "balancesCheck",
		tags: ["balances"],
		description: "Check whether usage is allowed for a customer feature.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "check",
		}),
	})
	.input(ExtCheckParamsSchema)
	.output(CheckResponseV3Schema);

export const balancesTrackContract = oc
	.route({
		method: "POST",
		path: "/v1/balances.track",
		operationId: "balancesTrack",
		tags: ["balances"],
		description: "Track usage for a customer feature.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "track",
		}),
	})
	.input(TrackParamsSchema)
	.output(TrackResponseV3Schema);
