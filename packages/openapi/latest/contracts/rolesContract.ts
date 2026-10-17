import { ApiRoleSchema, ListRolesParamsSchema } from "@api/roles/apiRole.js";
import { oc } from "@orpc/contract";
import { z } from "zod/v4";
import { listRolesJsDoc } from "../jsDocs/rolesJsDocs";

const ownerAccess = {
	organisation: "write",
	customers: "write",
	features: "write",
	plans: "write",
	rewards: "write",
	balances: "write",
	billing: "write",
	migrations: "write",
	analytics: "read",
	apiKeys: "write",
	platform: "write",
} as const;

const ListRolesResponseSchema = z.object({ list: z.array(ApiRoleSchema) });

export const listRolesContract = oc
	.route({
		method: "POST",
		path: "/v1/roles.list",
		operationId: "listRoles",
		tags: ["roles"],
		description: listRolesJsDoc,
		spec: (spec) => ({ ...spec, "x-speakeasy-name-override": "list" }),
	})
	.input(
		ListRolesParamsSchema.meta({ title: "ListRolesParams", examples: [{}] }),
	)
	.output(
		ListRolesResponseSchema.meta({
			title: "ListRolesResponse",
			examples: [
				{
					list: [
						{
							id: "owner",
							name: "Owner",
							built_in: true,
							access: ownerAccess,
							member_count: 1,
							rule_count: 0,
						},
						{
							id: "support",
							name: "Support",
							built_in: false,
							access: {
								...ownerAccess,
								organisation: "none",
								customers: "write",
								features: "read",
								plans: "read",
								rewards: "none",
								balances: "read",
								billing: "read",
								migrations: "none",
								analytics: "read",
								apiKeys: "none",
								platform: "none",
							},
							member_count: 3,
							rule_count: 1,
						},
					],
				},
			],
		}),
	);
