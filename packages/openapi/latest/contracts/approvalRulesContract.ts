import {
	ApprovalRuleIdParamsSchema,
	ApprovalRuleSchema,
	ApprovalRuleVersionSchema,
	CreateApprovalRuleParamsSchema,
	ListApprovalRulesParamsSchema,
	ReorderApprovalRulesParamsSchema,
	UpdateApprovalRuleParamsSchema,
} from "@api/approvals/schemas/approvalRule.js";
import { oc } from "@orpc/contract";
import { z } from "zod/v4";
import {
	createApprovalRuleJsDoc,
	deleteApprovalRuleJsDoc,
	getApprovalRuleJsDoc,
	listApprovalRulesJsDoc,
	listApprovalRuleVersionsJsDoc,
	reorderApprovalRulesJsDoc,
	updateApprovalRuleJsDoc,
} from "../jsDocs/approvalRulesJsDocs";

/** PRD §2 "Enterprise trials": Sales can give trials on one plan, shorter than two months, with no charge. */
const ruleParamsExample = {
	name: "Sales: Enterprise trials",
	effect: "allow" as const,
	subjects: [{ type: "role" as const, role_id: "sales" }],
	actions: ["billing.attach" as const],
	filter: {
		paid: false,
		incoming: {
			$every: {
				plan_id: "enterprise",
				free_trial: {
					duration: { $lt: { length: 2, unit: "month" as const } },
				},
			},
		},
	},
	note: "Longer trials or paid plans need an admin.",
	enabled: true,
};

const ruleExample = {
	...ruleParamsExample,
	id: "apr_2xKq8NfYp1",
	position: 0,
	version: 1,
	updated_by: { user_id: "usr_3fJ9aQ", name: "Ada Lovelace" },
	created_at: 1781113864000,
	updated_at: 1781113864000,
};

const ListApprovalRulesResponseSchema = z.object({
	list: z.array(ApprovalRuleSchema),
});
const ListApprovalRuleVersionsResponseSchema = z.object({
	list: z.array(ApprovalRuleVersionSchema),
});
const DeleteApprovalRuleResponseSchema = z.object({ success: z.literal(true) });

/** PRD §8 A, placed first by the reorder example. */
const lockdownExample = {
	...ruleExample,
	id: "apr_7Lm2Wc",
	name: "No billing changes",
	effect: "block" as const,
	subjects: [{ type: "everyone" as const }],
	filter: null,
	note: "Billing changes are locked. Ask an owner.",
};

const route = ({
	verb,
	operationId,
	nameOverride,
	description,
}: {
	verb: string;
	operationId: string;
	nameOverride: string;
	description: string;
}) =>
	oc.route({
		method: "POST",
		path: `/v1/approval_rules.${verb}` as `/${string}`,
		operationId,
		tags: ["approval_rules"],
		description,
		spec: (spec) => ({
			...spec,
			"x-speakeasy-name-override": nameOverride,
		}),
	});

const ruleOutput = ({ examples }: { examples: unknown[] }) =>
	ApprovalRuleSchema.meta({ title: "ApprovalRule", examples });

export const listApprovalRulesContract = route({
	verb: "list",
	operationId: "listApprovalRules",
	nameOverride: "list",
	description: listApprovalRulesJsDoc,
})
	.input(
		ListApprovalRulesParamsSchema.meta({
			title: "ListApprovalRulesParams",
			examples: [{}],
		}),
	)
	.output(
		ListApprovalRulesResponseSchema.meta({
			title: "ListApprovalRulesResponse",
			examples: [{ list: [ruleExample] }],
		}),
	);

export const getApprovalRuleContract = route({
	verb: "get",
	operationId: "getApprovalRule",
	nameOverride: "get",
	description: getApprovalRuleJsDoc,
})
	.input(
		ApprovalRuleIdParamsSchema.meta({
			title: "GetApprovalRuleParams",
			examples: [{ id: ruleExample.id }],
		}),
	)
	.output(ruleOutput({ examples: [ruleExample] }));

export const createApprovalRuleContract = route({
	verb: "create",
	operationId: "createApprovalRule",
	nameOverride: "create",
	description: createApprovalRuleJsDoc,
})
	.input(
		CreateApprovalRuleParamsSchema.meta({
			title: "CreateApprovalRuleParams",
			examples: [ruleParamsExample],
		}),
	)
	.output(ruleOutput({ examples: [ruleExample] }));

export const updateApprovalRuleContract = route({
	verb: "update",
	operationId: "updateApprovalRule",
	nameOverride: "update",
	description: updateApprovalRuleJsDoc,
})
	.input(
		UpdateApprovalRuleParamsSchema.meta({
			title: "UpdateApprovalRuleParams",
			examples: [{ id: ruleExample.id, enabled: false }],
		}),
	)
	.output(
		ruleOutput({ examples: [{ ...ruleExample, enabled: false, version: 2 }] }),
	);

export const deleteApprovalRuleContract = route({
	verb: "delete",
	operationId: "deleteApprovalRule",
	nameOverride: "delete",
	description: deleteApprovalRuleJsDoc,
})
	.input(
		ApprovalRuleIdParamsSchema.meta({
			title: "DeleteApprovalRuleParams",
			examples: [{ id: ruleExample.id }],
		}),
	)
	.output(
		DeleteApprovalRuleResponseSchema.meta({
			title: "DeleteApprovalRuleResponse",
			examples: [{ success: true }],
		}),
	);

export const reorderApprovalRulesContract = route({
	verb: "reorder",
	operationId: "reorderApprovalRules",
	nameOverride: "reorder",
	description: reorderApprovalRulesJsDoc,
})
	.input(
		ReorderApprovalRulesParamsSchema.meta({
			title: "ReorderApprovalRulesParams",
			examples: [{ ids: [lockdownExample.id, ruleExample.id] }],
		}),
	)
	.output(
		ListApprovalRulesResponseSchema.meta({
			title: "ReorderApprovalRulesResponse",
			examples: [
				{
					list: [
						{ ...lockdownExample, position: 0 },
						{ ...ruleExample, position: 1 },
					],
				},
			],
		}),
	);

export const listApprovalRuleVersionsContract = route({
	verb: "versions.list",
	operationId: "listApprovalRuleVersions",
	nameOverride: "listVersions",
	description: listApprovalRuleVersionsJsDoc,
})
	.input(
		ApprovalRuleIdParamsSchema.meta({
			title: "ListApprovalRuleVersionsParams",
			examples: [{ id: ruleExample.id }],
		}),
	)
	.output(
		ListApprovalRuleVersionsResponseSchema.meta({
			title: "ListApprovalRuleVersionsResponse",
			examples: [
				{
					list: [
						{
							rule_id: ruleExample.id,
							version: 1,
							rule: { ...ruleParamsExample, position: 0 },
							updated_by: ruleExample.updated_by,
							created_at: ruleExample.created_at,
						},
					],
				},
			],
		}),
	);
