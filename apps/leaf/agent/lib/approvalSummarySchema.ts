import { APPROVAL_SUMMARY_KEY } from "../../src/internal/approvals/utils/approvalSummary.js";
import type { JsonSchemaObject } from "../../src/internal/autumnMcp/rpcClient.js";

const APPROVAL_SUMMARY_DESCRIPTION =
	"Required. Write the concise message shown immediately after the approval card. " +
	"In 1-3 short sentences, explain the material interpretation or default you chose, " +
	"any customer-state edge case that affects the decision, and non-obvious request settings. " +
	"Use only facts from the request, billing docs, and tool results. Never ask for confirmation " +
	"or repeat card details except to state the preview's exact next-payment amount and date. Use plain English: say 'a draft invoice will be created', never 'invoice mode', 'draft invoice mode', or 'enabled'. Never describe a requested write " +
	"unless you issue it in the same batch. For grouped writes, put the same complete summary on every write.";

export const withApprovalSummarySchema = (
	schema: JsonSchemaObject,
): JsonSchemaObject => ({
	...schema,
	properties: {
		...((schema.properties as JsonSchemaObject | undefined) ?? {}),
		[APPROVAL_SUMMARY_KEY]: {
			description: APPROVAL_SUMMARY_DESCRIPTION,
			maxLength: 600,
			minLength: 1,
			type: "string",
		},
	},
	required: [
		...new Set([
			...((schema.required as string[] | undefined) ?? []),
			APPROVAL_SUMMARY_KEY,
		]),
	],
});
