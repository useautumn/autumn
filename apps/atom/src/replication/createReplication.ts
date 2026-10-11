import type { AutumnLogger } from "@autumn/logging";
import type { ThreadCounters } from "../threads/stats/threadStats.js";
import {
	createPeerResolver,
	type PeerResolver,
} from "./discovery/createPeerResolver.js";
import type { HandlerRegistry } from "./handlers/createHandlerRegistry.js";
import { createPeerOutbox } from "./outbox/createPeerOutbox.js";
import { createPeerSender } from "./transport/sendToPeer.js";
import type { Replication } from "./types/replication.js";

type ReplicationContext = {
	tokenHash: string;
	port: number;
	registry: HandlerRegistry;
	counters: Pick<ThreadCounters, "add">;
	logger: Pick<AutumnLogger, "warn">;
	resolver?: PeerResolver;
};

/** One per thread: the operations this thread applies, carried to every other replica named by the deployment's service. */
export const createReplication = ({
	ctx,
}: {
	ctx: ReplicationContext;
}): Replication => {
	const resolver = ctx.resolver ?? createPeerResolver();
	const outbox = createPeerOutbox({
		ctx: {
			resolver,
			send: createPeerSender({
				ctx: { tokenHash: ctx.tokenHash, port: ctx.port },
			}),
			counters: ctx.counters,
			logger: ctx.logger,
		},
	});
	return {
		replicate: (operation) => {
			void outbox.enqueue({
				operation,
				path: ctx.registry.pathOf({ kind: operation.kind }),
			});
		},
		peers: () => resolver.peers(),
		stop: () => outbox.stop(),
	};
};
