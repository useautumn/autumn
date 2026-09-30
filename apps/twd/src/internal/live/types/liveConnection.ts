import type { LiveServerMessage } from "../../../api/contract.ts";
import type { Actor } from "../../../lib/types/actor.ts";

/** One WebSocket client. `pending` buffers a topic's events until its snapshot is sent. */
export type LiveConnection = {
	id: string;
	actor: Actor;
	topics: Set<string>;
	pending: Map<string, LiveServerMessage[]>;
	seq: number;
	send: (message: LiveServerMessage) => void;
	bufferedAmount: () => number;
	close: (args: { code: number; reason: string }) => void;
};
