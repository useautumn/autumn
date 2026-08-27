/**
 * Prod incident 2026-08-25: leaf read the Postgres workflow journal whenever a
 * chat DB URL existed, but eve was journaling to its local-file world, so the
 * reader tailed an empty table forever, the liveness check saw no hook, and the
 * exact count reset the cursor to 0.
 *
 * Red: with a reachable world that does not hold the run, leaf still counts
 * and checks liveness through it.
 * Green: every world read is skipped for a run the world does not hold, and
 * events, counts, and liveness come over HTTP instead.
 */

import { afterAll, describe, expect, mock, test } from "bun:test";
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
		env: { EVE_INTERNAL_AUTH_TOKEN: "t", EVE_SERVER_URL: "http://eve.test" },
	}),
});

const worldCalls: string[] = [];
const notFound = () => {
	const error = new Error("Run not found");
	error.name = "NotFoundError";
	return error;
};
mock.module("@workflow/world-postgres", () => ({
	createWorld: () => ({
		events: { create: async () => undefined },
		hooks: {
			getByToken: async () => {
				worldCalls.push("hooks.getByToken");
				throw notFound();
			},
		},
		runs: {
			get: async () => {
				worldCalls.push("runs.get");
				throw notFound();
			},
		},
		streams: {
			get: async () => {
				worldCalls.push("streams.get");
				return new ReadableStream({ start: () => undefined });
			},
			getInfo: async () => {
				worldCalls.push("streams.getInfo");
				return { tailIndex: -1 };
			},
			list: async () => [],
		},
	}),
}));

process.env.CHAT_DATABASE_URL = "postgresql://world.test/postgres";

const { streamEveEvents, fastForwardEveStreamIndex } = await import(
	"../../../src/internal/agentRuntime/eve/client.js"
);
const { isContinuationTokenAlive } = await import(
	"../../../src/internal/agentRuntime/eve/world/sessionRun.js"
);

const originalFetch = globalThis.fetch;
const fetched: string[] = [];
globalThis.fetch = (async (url: unknown) => {
	fetched.push(String(url));
	return new Response('{"type":"turn.started"}\n{"type":"session.waiting"}\n');
}) as unknown as typeof fetch;
afterAll(() => {
	globalThis.fetch = originalFetch;
});

const session = (): EveSessionRef => ({
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "wrun_not_in_world",
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

describe("world reads are guarded by run presence", () => {
	test("a run the world does not hold streams over HTTP", async () => {
		const seen: string[] = [];
		for await (const event of streamEveEvents({
			auth: {} as never,
			session: session(),
		})) {
			seen.push(event.type);
		}
		expect(seen).toEqual(["turn.started", "session.waiting"]);
		expect(fetched.some((url) => url.includes("/stream"))).toBe(true);
		expect(worldCalls).not.toContain("streams.get");
	});

	test("liveness is unknown, not dead, for a run the world does not hold", async () => {
		expect(
			await isContinuationTokenAlive({
				sessionId: "wrun_not_in_world",
				token: "token_1",
			}),
		).toBeUndefined();
		expect(worldCalls).not.toContain("hooks.getByToken");
	});

	test("fast-forward falls back to the HTTP replay count", async () => {
		const current = session();
		await fastForwardEveStreamIndex({ auth: {} as never, session: current });
		expect(current.state.streamIndex).toBe(2);
		expect(worldCalls).not.toContain("streams.getInfo");
	});
});
