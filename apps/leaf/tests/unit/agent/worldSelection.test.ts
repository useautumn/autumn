/**
 * The chat database is the one durable workflow world. Every world query
 * runs on CHAT_DATABASE_URL (the bouncer in prod); only the stream LISTEN
 * connection moves to CHAT_DATABASE_DIRECT_URL when it is set.
 */

import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Socket } from "bun";
import pg from "pg";
import { createListenerRoutedPool } from "../../../agent/lib/workflowWorld/listenerRoutedPool.js";
import { createWorld } from "../../../agent/lib/workflowWorld/workflowWorld.js";
import {
	durableWorldEnv,
	selectDurableWorld,
} from "../../../src/internal/agentRuntime/eve/durableWorld.js";

const AGENT_MODULE = "../../../agent/agent.js";
const saved = { ...process.env };

const resetEnv = () => {
	for (const key of Object.keys(process.env)) {
		if (!(key in saved)) delete process.env[key];
	}
	Object.assign(process.env, saved);
};

const importAgent = () => import(`${AGENT_MODULE}?${Math.random()}`);

/** A TCP endpoint that accepts and counts connections but never speaks Postgres. */
const startPostgresStub = () => {
	const sockets = new Set<Socket>();
	let accepted = 0;
	const server = Bun.listen({
		hostname: "127.0.0.1",
		port: 0,
		socket: {
			open: (socket) => {
				accepted += 1;
				sockets.add(socket);
			},
			data: () => undefined,
			close: (socket) => {
				sockets.delete(socket);
			},
		},
	});
	return {
		url: `postgres://leaf:leaf@127.0.0.1:${server.port}/chat`,
		accepted: () => accepted,
		stop: () => {
			for (const socket of sockets) socket.end();
			server.stop(true);
		},
	};
};

const waitFor = async (condition: () => boolean) => {
	const deadline = Date.now() + 2000;
	while (!condition() && Date.now() < deadline) await Bun.sleep(10);
};

describe("workflow world selection", () => {
	afterEach(resetEnv);

	test("a chat database selects leaf's Postgres world module", async () => {
		delete process.env.NODE_ENV;
		delete process.env.EVE_EMBEDDED;
		delete process.env.EVE_WORKFLOW_WORLD;
		delete process.env.WORKFLOW_QUEUE_NAMESPACE;
		process.env.CHAT_DATABASE_URL = "postgres://chat-host/chat";

		const agent = (await importAgent()).default as {
			experimental?: { workflow?: { world?: string } };
		};
		expect(agent.experimental?.workflow?.world).toBe(
			"@autumn/leaf/workflow-world",
		);
		expect(process.env.WORKFLOW_POSTGRES_URL).toBe("postgres://chat-host/chat");
		expect(process.env.WORKFLOW_QUEUE_NAMESPACE).toMatch(/^local_/);
	});

	test("the world specifier resolves to the module exporting createWorld", async () => {
		const resolved = import.meta.resolve("@autumn/leaf/workflow-world");
		expect(resolved).toEndWith("/agent/lib/workflowWorld/workflowWorld.ts");
		const worldModule = await import("@autumn/leaf/workflow-world");
		expect(worldModule.createWorld).toBe(createWorld);
	});

	test("production keeps the shared queue namespace", async () => {
		process.env.NODE_ENV = "production";
		delete process.env.WORKFLOW_QUEUE_NAMESPACE;
		process.env.CHAT_DATABASE_URL = "postgres://chat-host/chat";

		await importAgent();
		expect(process.env.WORKFLOW_QUEUE_NAMESPACE).toBeUndefined();
	});

	test("no chat database means the local file world", async () => {
		delete process.env.CHAT_DATABASE_URL;
		delete process.env.WORKFLOW_POSTGRES_URL;
		delete process.env.EVE_WORKFLOW_WORLD;

		const agent = (await importAgent()).default as {
			experimental?: { workflow?: { world?: string } };
		};
		expect(agent.experimental?.workflow?.world).toBeUndefined();
	});
});

describe("durable world selection", () => {
	const BOUNCER = "postgres://u:p@bouncer:6432/chat";
	const DIRECT = "postgres://u:p@direct:5432/chat";

	const verifying = (delivered: boolean) =>
		mock(async (_urls: { listenUrl: string; notifyUrl: string }) => delivered);

	test("no URLs: local world, nothing probed", async () => {
		const verify = verifying(true);
		expect(
			await selectDurableWorld({
				chatDatabaseUrl: undefined,
				chatDatabaseDirectUrl: undefined,
				verify,
			}),
		).toBeUndefined();
		expect(verify).not.toHaveBeenCalled();
	});

	test("direct URL alone: local world, nothing probed", async () => {
		const verify = verifying(true);
		expect(
			await selectDurableWorld({
				chatDatabaseUrl: undefined,
				chatDatabaseDirectUrl: DIRECT,
				verify,
			}),
		).toBeUndefined();
		expect(verify).not.toHaveBeenCalled();
	});

	test("chat URL alone: probes and listens on that one URL, as before", async () => {
		const verify = verifying(true);
		expect(
			await selectDurableWorld({
				chatDatabaseUrl: BOUNCER,
				chatDatabaseDirectUrl: undefined,
				verify,
			}),
		).toEqual({ queryUrl: BOUNCER, listenUrl: BOUNCER });
		expect(verify).toHaveBeenCalledWith({
			listenUrl: BOUNCER,
			notifyUrl: BOUNCER,
		});
	});

	test("chat URL alone that fails the probe: local world", async () => {
		expect(
			await selectDurableWorld({
				chatDatabaseUrl: BOUNCER,
				chatDatabaseDirectUrl: undefined,
				verify: verifying(false),
			}),
		).toBeUndefined();
	});

	test("both URLs: LISTEN on direct, NOTIFY through the bouncer", async () => {
		const verify = verifying(true);
		expect(
			await selectDurableWorld({
				chatDatabaseUrl: BOUNCER,
				chatDatabaseDirectUrl: DIRECT,
				verify,
			}),
		).toEqual({ queryUrl: BOUNCER, listenUrl: DIRECT });
		expect(verify).toHaveBeenCalledWith({
			listenUrl: DIRECT,
			notifyUrl: BOUNCER,
		});
	});

	test("both URLs that fail the probe: local world", async () => {
		expect(
			await selectDurableWorld({
				chatDatabaseUrl: BOUNCER,
				chatDatabaseDirectUrl: DIRECT,
				verify: verifying(false),
			}),
		).toBeUndefined();
	});

	test("an unproven world withholds both chat URLs from eve", () => {
		const env = durableWorldEnv({
			env: { CHAT_DATABASE_URL: BOUNCER, CHAT_DATABASE_DIRECT_URL: DIRECT },
			world: undefined,
			workerConcurrency: "10",
			maxPoolSize: "6",
		});
		expect(env.CHAT_DATABASE_URL).toBeUndefined();
		expect(env.CHAT_DATABASE_DIRECT_URL).toBeUndefined();
		expect(env.WORKFLOW_POSTGRES_URL).toBeUndefined();
	});

	test("a proven world hands eve the query and listen URLs with the caps", () => {
		const env = durableWorldEnv({
			env: { CHAT_DATABASE_URL: BOUNCER, CHAT_DATABASE_DIRECT_URL: DIRECT },
			world: { queryUrl: BOUNCER, listenUrl: DIRECT },
			workerConcurrency: "10",
			maxPoolSize: "6",
		});
		expect(env).toMatchObject({
			CHAT_DATABASE_URL: BOUNCER,
			WORKFLOW_POSTGRES_URL: BOUNCER,
			CHAT_DATABASE_DIRECT_URL: DIRECT,
			WORKFLOW_POSTGRES_WORKER_CONCURRENCY: "10",
			WORKFLOW_POSTGRES_MAX_POOL_SIZE: "6",
		});
	});
});

describe("listener-routed pool", () => {
	afterEach(resetEnv);

	test("pool clients dial the query URL; pool.options names the listen URL", async () => {
		const bouncer = startPostgresStub();
		const direct = startPostgresStub();
		const pool = createListenerRoutedPool({
			queryUrl: bouncer.url,
			listenUrl: direct.url,
			max: 6,
		});
		const pooled = pool.connect().catch(() => undefined);
		await waitFor(() => bouncer.accepted() > 0);
		expect(bouncer.accepted()).toBe(1);
		expect(direct.accepted()).toBe(0);

		const listener = new pg.Client(pool.options)
			.connect()
			.catch(() => undefined);
		await waitFor(() => direct.accepted() > 0);
		expect(direct.accepted()).toBe(1);
		expect(bouncer.accepted()).toBe(1);
		expect(pool.options.max).toBe(6);

		bouncer.stop();
		direct.stop();
		await Promise.all([pooled, listener]);
		await pool.end();
	});

	/** Records where pg clients dial without opening sockets: world.close() can't run under bun. */
	const recordDials = () => {
		const dials: string[] = [];
		const connect = spyOn(pg.Client.prototype, "connect").mockImplementation(
			async function (
				this: pg.Client & {
					connectionParameters: { host: string; port: number };
				},
			) {
				dials.push(
					`${this.connectionParameters.host}:${this.connectionParameters.port}`,
				);
			} as never,
		);
		const query = spyOn(pg.Client.prototype, "query").mockImplementation(
			(async () => ({ rows: [] })) as never,
		);
		return {
			dials,
			restore: () => {
				connect.mockRestore();
				query.mockRestore();
			},
		};
	};

	// Fails if a world-postgres upgrade stops opening its LISTEN client from pool.options.
	test("world-postgres opens its stream LISTEN on CHAT_DATABASE_DIRECT_URL only", async () => {
		const recorder = recordDials();
		try {
			process.env.WORKFLOW_POSTGRES_URL = "postgres://u:p@bouncer:6432/chat";
			process.env.CHAT_DATABASE_DIRECT_URL = "postgres://u:p@direct:5432/chat";

			createWorld();
			await waitFor(() => recorder.dials.length > 0);
			expect(recorder.dials).toEqual(["direct:5432"]);
		} finally {
			recorder.restore();
		}
	});

	test("without a direct URL the listener stays on the chat URL", async () => {
		const recorder = recordDials();
		try {
			process.env.WORKFLOW_POSTGRES_URL = "postgres://u:p@bouncer:6432/chat";
			delete process.env.CHAT_DATABASE_DIRECT_URL;

			createWorld();
			await waitFor(() => recorder.dials.length > 0);
			expect(recorder.dials).toEqual(["bouncer:6432"]);
		} finally {
			recorder.restore();
		}
	});

	test("the world refuses to start without a query URL", () => {
		delete process.env.WORKFLOW_POSTGRES_URL;
		expect(() => createWorld()).toThrow("WORKFLOW_POSTGRES_URL");
	});
});
