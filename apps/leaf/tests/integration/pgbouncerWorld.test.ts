/**
 * Prod's chat database shape: queries through a transaction-mode PgBouncer,
 * one LISTEN on a direct connection. Runs only when both URLs are set, e.g.
 *   docker compose -f tests/integration/pgbouncer/docker-compose.yml up -d --wait
 *   CHAT_DATABASE_URL=postgres://leaf:leaf@127.0.0.1:56432/chat \
 *   CHAT_DATABASE_DIRECT_URL=postgres://leaf:leaf@127.0.0.1:55432/chat \
 *   bun test tests/integration/pgbouncerWorld.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";

const bouncerUrl = process.env.CHAT_DATABASE_URL;
const directUrl = process.env.CHAT_DATABASE_DIRECT_URL;
const describeWithBouncer =
	bouncerUrl && directUrl && bouncerUrl !== directUrl
		? describe
		: describe.skip;

const leafRoot = new URL("../../", import.meta.url).pathname;
const READ_TIMEOUT_MS = 3000;

type LeafWorld = ReturnType<
	typeof import("../../agent/lib/workflowWorld/workflowWorld.js").createWorld
>;

/** world-postgres reads its URLs from env at createWorld(), like eve's runtime. */
const createLeafWorld = async ({ listenUrl }: { listenUrl?: string }) => {
	const { createWorld } = await import(
		"../../agent/lib/workflowWorld/workflowWorld.js"
	);
	process.env.WORKFLOW_POSTGRES_URL = bouncerUrl;
	if (listenUrl) process.env.CHAT_DATABASE_DIRECT_URL = listenUrl;
	else delete process.env.CHAT_DATABASE_DIRECT_URL;
	try {
		return createWorld();
	} finally {
		process.env.CHAT_DATABASE_DIRECT_URL = directUrl;
	}
};

/** Opens a reader on a fresh stream, writes one chunk from another world, and
 * returns what the reader saw within the timeout. */
const deliverOneChunk = async ({
	writer,
	reader,
}: {
	writer: LeafWorld;
	reader: LeafWorld;
}) => {
	const runId = `wrun_test_${crypto.randomUUID()}`;
	const name = `strm_test_${crypto.randomUUID()}`;
	const stream = await reader.streams.get(runId, name);
	const streamReader = stream.getReader();
	await Bun.sleep(200);
	await writer.streams.write(runId, name, new TextEncoder().encode("hello"));
	const result = await Promise.race([
		streamReader.read(),
		Bun.sleep(READ_TIMEOUT_MS).then(() => "timeout" as const),
	]);
	await streamReader.cancel().catch(() => undefined);
	if (result === "timeout") return result;
	return new TextDecoder().decode(result.value);
};

describeWithBouncer("workflow world behind a transaction pooler", () => {
	const worlds: LeafWorld[] = [];
	const track = (world: LeafWorld) => {
		worlds.push(world);
		return world;
	};

	beforeAll(async () => {
		const bootstrap = Bun.spawn({
			cmd: ["bunx", "--package", "@workflow/world-postgres", "bootstrap"],
			cwd: leafRoot,
			env: { ...process.env, WORKFLOW_POSTGRES_URL: bouncerUrl },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(await bootstrap.exited).toBe(0);
	});

	afterAll(async () => {
		// world-local's queue close throws under bun; the pool still ends.
		await Promise.all(
			worlds.map((world) => world.close().catch(() => undefined)),
		);
	});

	test("today's single bouncer URL fails the NOTIFY check", async () => {
		const { verifyNotifyDelivery } = await import(
			"../../src/internal/agentRuntime/eve/verifyNotifyDelivery.js"
		);
		expect(
			await verifyNotifyDelivery({
				listenUrl: bouncerUrl as string,
				notifyUrl: bouncerUrl as string,
			}),
		).toBe(false);
	});

	test("LISTEN on direct with NOTIFY through the bouncer passes", async () => {
		const { verifyNotifyDelivery } = await import(
			"../../src/internal/agentRuntime/eve/verifyNotifyDelivery.js"
		);
		expect(
			await verifyNotifyDelivery({
				listenUrl: directUrl as string,
				notifyUrl: bouncerUrl as string,
			}),
		).toBe(true);
	});

	test("selection makes the bouncer + direct pair durable", async () => {
		const { selectDurableWorld } = await import(
			"../../src/internal/agentRuntime/eve/durableWorld.js"
		);
		expect(
			await selectDurableWorld({
				chatDatabaseUrl: bouncerUrl,
				chatDatabaseDirectUrl: directUrl,
			}),
		).toEqual({
			queryUrl: bouncerUrl as string,
			listenUrl: directUrl as string,
		});
		expect(
			await selectDurableWorld({
				chatDatabaseUrl: bouncerUrl,
				chatDatabaseDirectUrl: undefined,
			}),
		).toBeUndefined();
	});

	test("a stream chunk written through the bouncer reaches a direct listener", async () => {
		const writer = track(await createLeafWorld({ listenUrl: directUrl }));
		const reader = track(await createLeafWorld({ listenUrl: directUrl }));
		expect(await deliverOneChunk({ writer, reader })).toBe("hello");
	});

	test("the same chunk never reaches a listener on the bouncer", async () => {
		const writer = track(await createLeafWorld({ listenUrl: directUrl }));
		const reader = track(await createLeafWorld({ listenUrl: undefined }));
		expect(await deliverOneChunk({ writer, reader })).toBe("timeout");
	});

	test("each world adds exactly one direct connection, its LISTEN", async () => {
		const sql = postgres(directUrl as string, { max: 1 });
		// Direct clients share this probe's address; bouncer backends come from the bouncer's.
		const directBackends = () => sql<{ total: number; listening: number }[]>`
			select count(*)::int as total,
				count(*) filter (where query = 'LISTEN workflow_event_chunk')::int as listening
			from pg_stat_activity
			where pid <> pg_backend_pid() and backend_type = 'client backend'
				and client_addr = (select client_addr from pg_stat_activity where pid = pg_backend_pid())`;
		try {
			const [before] = await directBackends();
			const world = track(await createLeafWorld({ listenUrl: directUrl }));
			await world.runs.list({ pagination: { limit: 1 } });
			await Bun.sleep(500);
			const [after] = await directBackends();
			expect(after.total - before.total).toBe(1);
			expect(after.listening - before.listening).toBe(1);
		} finally {
			await sql.end({ timeout: 1 });
		}
	});
});
