import { APPROVAL_DESCRIPTION_KEY } from "../../src/internal/approvals/utils/approvalDescription.js";
import type { JsonSchemaObject } from "../../src/internal/autumnMcp/rpcClient.js";

const APPROVAL_DESCRIPTION_TEXT =
	"Required. Write the walkthrough posted immediately after the approval card. " +
	"Open with one short line naming the change, then a bullet per change describing what happens to the customer. " +
	"Cover the material interpretation or default you chose, any customer-state edge case that affects the decision, " +
	"and non-obvious request settings. A change with a preview must state its exact next-payment amount and date. " +
	"Use only facts from the request, billing docs, and tool results, and never ask for confirmation. " +
	"Use plain English: say 'a draft invoice will be created', never 'invoice mode', 'draft invoice mode', or 'enabled'. " +
	"Never describe a requested write unless you issue it in the same batch. " +
	"For grouped writes, put the same complete description on every write.";

export const withApprovalDescriptionSchema = (
	schema: JsonSchemaObject,
): JsonSchemaObject => ({
	...schema,
	properties: {
		...((schema.properties as JsonSchemaObject | undefined) ?? {}),
		[APPROVAL_DESCRIPTION_KEY]: {
			description: APPROVAL_DESCRIPTION_TEXT,
			minLength: 1,
			type: "string",
		},
	},
	required: [
		...new Set([
			...((schema.required as string[] | undefined) ?? []),
			APPROVAL_DESCRIPTION_KEY,
		]),
	],
});
