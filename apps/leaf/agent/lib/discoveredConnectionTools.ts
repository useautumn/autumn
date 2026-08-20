import type { ModelMessage } from "ai";

type ConnectionSearchItem = { qualifiedName?: string };

const searchResultItems = (output: unknown): ConnectionSearchItem[] => {
	if (Array.isArray(output)) return output as ConnectionSearchItem[];
	const value = (output as { value?: unknown } | undefined)?.value;
	return Array.isArray(value) ? (value as ConnectionSearchItem[]) : [];
};

/** Names the framework's connection resolver already serves from a past
 * connection_search — re-registering them would be a name collision. The
 * prompt says never to search, but a model that does must not crash the
 * step. */
export const discoveredConnectionToolNames = (
	messages: readonly ModelMessage[],
) => {
	const names = new Set<string>();
	for (const message of messages) {
		if (message.role !== "tool" || !Array.isArray(message.content)) continue;
		for (const part of message.content) {
			const result = part as {
				output?: unknown;
				toolName?: string;
				type?: string;
			};
			if (result.type !== "tool-result") continue;
			if (result.toolName !== "connection_search") continue;
			for (const item of searchResultItems(result.output)) {
				if (item.qualifiedName) names.add(item.qualifiedName);
			}
		}
	}
	return names;
};
