import {
	type ApprovalRule,
	CreateApprovalRuleParamsSchema,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { ApprovalPrincipal } from "@autumn/shared/api/approvals/evaluate/index.js";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";

type PermissionFactsTestOptions = {
	/** Evaluated against the preview's facts, so tests need no rule storage. */
	rules: ApprovalRule[];
	principal?: ApprovalPrincipal;
};

const PermissionFactsHeaderSchema = z.object({
	rules: z.array(CreateApprovalRuleParamsSchema).default([]),
	principal: z
		.discriminatedUnion("type", [
			z.object({
				type: z.literal("user"),
				user_id: z.string(),
				role: z.string(),
			}),
			z.object({ type: z.literal("api_key"), key_id: z.string() }),
		])
		.optional(),
});

// Malformed JSON falls through to the schema, so it surfaces as a 400.
const parseJson = (value: string): unknown => {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
};

/** `x-include-permission-facts`: `{ rules?, principal? }` as JSON. Non-prod only. */
export const parsePermissionFactsHeader = ({
	header,
}: {
	header: string;
}): PermissionFactsTestOptions => {
	const parsed = PermissionFactsHeaderSchema.safeParse(parseJson(header));
	if (!parsed.success) {
		throw new RecaseError({
			message: `Invalid x-include-permission-facts header: ${z.prettifyError(parsed.error)}`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	return {
		principal: parsed.data.principal,
		rules: parsed.data.rules.map((rule, index) => ({
			...rule,
			id: `inline_rule_${index}`,
			version: 1,
			updated_by: { user_id: "inline", name: "Inline test rule" },
			created_at: 0,
			updated_at: 0,
		})),
	};
};
