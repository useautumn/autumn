import { toolDomains } from "./domains.js";

/** Destructive ops plus post-preview billing writes; leaf maps each to approval scopes (approvalScopeRequirements). */
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
