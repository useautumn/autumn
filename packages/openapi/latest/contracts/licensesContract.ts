import {
	getListResponseSchema,
	SuccessResponseSchema,
} from "@api/common/commonResponses.js";
import {
	ApiCustomerLicenseV0Schema,
	AttachLicenseParamsV0Schema,
	LicenseListAssignmentsParamsSchema,
	LicenseListParamsSchema,
	ReleaseLicenseParamsV0Schema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";
import { z } from "zod/v4";

const LicenseAssignmentSchema = z.object({
	id: z.string(),
	entity_id: z.string(),
	license_plan_id: z.string(),
	started_at: z.number(),
	ended_at: z.number().nullable(),
});

export const attachLicenseContract = oc
	.route({
		method: "POST",
		path: "/v1/licenses.attach",
		operationId: "attachLicense",
		tags: ["licenses"],
		description: "Assigns licenses to one or more entities.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "attach",
		}),
	})
	.input(
		AttachLicenseParamsV0Schema.meta({
			title: "AttachLicenseParams",
			examples: [
				{
					customer_id: "cus_123",
					plan_id: "seat_plan",
					entities: [{ entity_id: "user_123", name: "Ada Lovelace" }],
				},
			],
		}),
	)
	.output(SuccessResponseSchema);

export const releaseLicenseContract = oc
	.route({
		method: "POST",
		path: "/v1/licenses.release",
		operationId: "releaseLicense",
		tags: ["licenses"],
		description: "Releases licenses assigned to one or more entities.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "release",
		}),
	})
	.input(
		ReleaseLicenseParamsV0Schema.meta({
			title: "ReleaseLicenseParams",
			examples: [
				{
					customer_id: "cus_123",
					license_plan_id: "seat_plan",
					entity_ids: ["user_123"],
				},
			],
		}),
	)
	.output(SuccessResponseSchema);

export const listLicenseAssignmentsContract = oc
	.route({
		method: "POST",
		path: "/v1/licenses.list_assignments",
		operationId: "listLicenseAssignments",
		tags: ["licenses"],
		description: "Lists license assignments for a customer.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "listAssignments",
			"x-speakeasy-ignore": true,
		}),
	})
	.input(
		LicenseListAssignmentsParamsSchema.meta({
			title: "ListLicenseAssignmentsParams",
			examples: [{ customer_id: "cus_123", active: true }],
		}),
	)
	.output(
		getListResponseSchema({
			schema: LicenseAssignmentSchema,
			id: "ListLicenseAssignmentsResponse",
		}).meta({
			examples: [
				{
					list: [
						{
							id: "lic_asn_123",
							entity_id: "user_123",
							license_plan_id: "seat_plan",
							started_at: 1759247877000,
							ended_at: null,
						},
					],
				},
			],
		}),
	);

export const listLicensesContract = oc
	.route({
		method: "POST",
		path: "/v1/licenses.list",
		operationId: "listLicenses",
		tags: ["licenses"],
		description: "Lists a customer's license pools and available seats.",
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": "list",
			"x-speakeasy-ignore": true,
		}),
	})
	.input(
		LicenseListParamsSchema.meta({
			title: "ListLicensesParams",
			examples: [{ customer_id: "cus_123" }],
		}),
	)
	.output(
		getListResponseSchema({
			schema: ApiCustomerLicenseV0Schema,
			id: "ListLicensesResponse",
		}).meta({
			examples: [
				{
					list: [
						{
							license_plan_id: "seat_plan",
							parent_plan_id: "pro_plan",
							license_plan_name: "Seat",
							granted: 10,
							usage: 3,
							remaining: 7,
							paid_quantity: 5,
						},
					],
				},
			],
		}),
	);
