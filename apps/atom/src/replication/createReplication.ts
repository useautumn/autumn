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
	secret: string;
	port: number;
	registry: HandlerRegistry;
	counters: Pick<ThreadCounters, "add">;
	logger: Pick<AutumnLogger, "warn">;
	peersFile?: string | null;
	resolver?: PeerResolver;
	now?: () => number;
	sleep?: (ms: number) => Promise<unknown>;
	fetch?: typeof fetch;
};

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
