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
	/** The deployment's own peer secret: what every request between replicas is signed with. */
	secret: string;
	/** The port replicas listen to each other on, never the public one. */
	port: number;
	registry: HandlerRegistry;
	counters: Pick<ThreadCounters, "add">;
	logger: Pick<AutumnLogger, "warn">;
	/** Where a replica set on one machine lists this replica's peers; null resolves the deployment's service name. */
	peersFile?: string | null;
	resolver?: PeerResolver;
	/** Test seams: the clock the outbox ages by, how it waits, and how it reaches a peer. */
	now?: () => number;
	sleep?: (ms: number) => Promise<unknown>;
	fetch?: typeof fetch;
};

/** One per thread: the operations this thread applies, carried to every other replica named by the deployment's service. */
export const createReplication = ({
	ctx,
}: {
	ctx: ReplicationContext;
}): Replication => {
	const resolver =
		ctx.resolver ?? createPeerResolver({ ctx: { peersFile: ctx.peersFile } });
	const outbox = createPeerOutbox({
		ctx: {
			resolver,
			send: createPeerSender({
				ctx: { secret: ctx.secret, port: ctx.port, fetch: ctx.fetch },
			}),
			counters: ctx.counters,
			logger: ctx.logger,
			now: ctx.now,
			sleep: ctx.sleep,
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
