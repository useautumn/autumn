/**
 * Without the durable journal, the replay recount frames NDJSON per HTTP chunk.
 * A record whose newline arrives at the head of the next chunk is dropped, so
 * the fast-forward cursor lands short and stale events replay as this turn.
 *
 * Red: two records split as `{…}` | `\n{…}\n` count as 1.
 * Green: the count is 2 regardless of where chunk boundaries fall.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { EveSessionRef } from "../../../src/internal/agentRuntime/eve/types.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

await mockLeafModule({
	specifier: "../../../src/lib/env.js",
	factory: () => ({
		env: {
			EVE_INTERNAL_AUTH_TOKEN: "t",
			EVE_SERVER_URL: "http://eve.test",
		},
	}),
});
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/world/sessionStream.js",
	factory: () => ({ sessionEventCount: async () => undefined }),
});

const { fastForwardEveStreamIndex } = await import(
	"../../../src/internal/agentRuntime/eve/client.js"
);

const originalFetch = globalThis.fetch;
afterAll(() => {
	globalThis.fetch = originalFetch;
});

/** One chunk per read, with a tick between, so the boundary is real. */
const streamOf = (chunks: string[]) => {
	const pending = [...chunks];
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			await Bun.sleep(5);
			const next = pending.shift();
			if (next === undefined) {
				controller.close();
				return;
			}
			controller.enqueue(new TextEncoder().encode(next));
		},
	});
};

const session = (): EveSessionRef => ({
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_1",
	state: {
		version: 1,
		continuationToken: "token_1",
		streamIndex: 0,
		status: "waiting",
		lastEventAt: 0,
		pendingRequests: [],
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
});

describe("replay recount across chunk boundaries", () => {
	test("a record whose newline opens the next chunk is still counted", async () => {
		globalThis.fetch = (async () =>
			new Response(
				streamOf(['{"type":"turn.started"}', '\n{"type":"session.waiting"}\n']),
			)) as unknown as typeof fetch;
		const current = session();
		await fastForwardEveStreamIndex({ auth: {} as never, session: current });
		expect(current.state.streamIndex).toBe(2);
	});
});
