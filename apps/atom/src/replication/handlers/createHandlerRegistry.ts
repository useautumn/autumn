import type { ReplicationHandler } from "../types/replicationHandler.js";

export type HandlerRegistry = {
	register(handler: ReplicationHandler): void;
	pathOf(params: { kind: string }): string;
	handlers(): ReplicationHandler[];
};

/** The kinds this Atom replicates, each with the route a peer posts it to. A kind nobody registered is a programming error. */
export const createHandlerRegistry = (): HandlerRegistry => {
	const byKind = new Map<string, ReplicationHandler>();
	return {
		register: (handler) => {
			byKind.set(handler.kind, handler);
		},
		pathOf: ({ kind }) => {
			const handler = byKind.get(kind);
			if (!handler)
				throw new Error(`No replication handler registered for ${kind}`);
			return handler.path;
		},
		handlers: () => [...byKind.values()],
	};
};
