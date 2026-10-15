import {
	ApprovalActionSchema,
	queryBoolean,
	type RuleSubject,
	RuleSubjectSchema,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listApprovalRules } from "../actions/listApprovalRules.js";

const ListApprovalRulesQuerySchema = z
	.object({
		subject_type: z.enum(["everyone", "role", "user"]).optional(),
		subject_id: z.string().min(1).optional(),
		action: ApprovalActionSchema.optional(),
		enabled: queryBoolean().optional(),
	})
	.refine(
		({ subject_type, subject_id }) =>
			subject_type === undefined || subject_type === "everyone" || subject_id,
		{
			message: "subject_id is required for role and user subjects.",
			path: ["subject_id"],
		},
	);

const querySubject = ({
	subject_type,
	subject_id,
}: z.infer<typeof ListApprovalRulesQuerySchema>): RuleSubject | undefined => {
	if (!subject_type) return undefined;
	return RuleSubjectSchema.parse({
		type: subject_type,
		role: subject_id,
		user_id: subject_id,
	});
};

export const handleListApprovalRules = createRoute({
	scopes: [Scopes.Organisation.Read],
	query: ListApprovalRulesQuerySchema,
	handler: async (c) => {
		const query = c.req.valid("query");
		const list = await listApprovalRules({
			ctx: c.get("ctx"),
			subject: querySubject(query),
			action: query.action,
			enabled: query.enabled,
		});
		return c.json({ list });
	},
});
