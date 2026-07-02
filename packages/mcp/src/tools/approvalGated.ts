import { toolDomains } from "./domains.js";

/**
 * Tools that suspend for user approval before writing: destructive operations
 * plus billing writes applied after a confirmed preview. Leaf's Slack approval
 * surface must map every one of these to required Autumn scopes
 * (apps/leaf/src/internal/approvals/utils/approvalScopeRequirements.ts).
 */
export const APPROVAL_GATED_TOOL_NAMES = [
	...new Set(
		toolDomains
			.flatMap((domain) => [
				...(domain.operations ?? []).filter(
					(operation) => operation.destructive,
				),
				...(domain.confirmedWrites ?? []),
			])
			.map((tool) => tool.id),
	),
];
