import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { LiveClientMessage } from "../../api/contract.ts";
import {
	addLiveConnection,
	removeLiveConnection,
	subscribeLive,
	unsubscribeLive,
} from "../../internal/live/liveHub/liveHub.ts";
import type { LiveConnection } from "../../internal/live/types/liveConnection.ts";
import type { TwdHono } from "../types/twdHono.ts";

/** One socket per client; topics are multiplexed over it (see LiveClientMessage). */
export const liveRoutes = new Hono<TwdHono>().get(
	"/ws",
	upgradeWebSocket((c) => {
		const ctx = c.get("ctx");
		const actor = ctx.actor;
		let connection: LiveConnection | undefined;
		return {
			onOpen: (_event, ws) => {
				if (!actor) return ws.close(4401, "unauthenticated");
				connection = {
					id: crypto.randomUUID(),
					actor,
					topics: new Set(),
					pending: new Map(),
					seq: 0,
					send: (message) => ws.send(JSON.stringify(message)),
					bufferedAmount: () =>
						(
							ws.raw as { getBufferedAmount?: () => number } | undefined
						)?.getBufferedAmount?.() ?? 0,
					close: ({ code, reason }) => ws.close(code, reason),
				};
				addLiveConnection({ connection });
				connection.send({
					type: "hello",
					connectionId: connection.id,
					actor: { userId: actor.userId, email: actor.email, via: actor.via },
				});
			},
			onMessage: (event, ws) => {
				if (!connection) return;
				const parsed = LiveClientMessage.safeParse(
					safeJson({ text: String(event.data) }),
				);
				if (!parsed.success) {
					connection.send({
						type: "error",
						error: {
							code: "invalid_message",
							message: parsed.error.issues
								.map((issue) => issue.message)
								.join("; "),
							next: 'Send {"type":"subscribe","topics":["runs"]} (topics: runs, run:<id>, jobs, keys, accounts, capacity, warm).',
							escalate: null,
						},
					});
					return;
				}
				const message = parsed.data;
				if (message.type === "ping") return connection.send({ type: "pong" });
				for (const topic of message.topics) {
					if (message.type === "subscribe")
						void subscribeLive({ ctx, connection, topic });
					else unsubscribeLive({ connection, topic });
				}
				void ws;
			},
			onClose: () => {
				if (connection) removeLiveConnection({ connectionId: connection.id });
			},
		};
	}),
);

const safeJson = ({ text }: { text: string }): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};
