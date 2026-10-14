import { toolDomains } from "./domains.js";

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
