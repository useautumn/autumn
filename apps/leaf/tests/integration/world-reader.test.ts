/**
 * The journal reader against a real Postgres workflow world: exact event
 * count and cursor-based replay straight from the tables eve writes.
 * Needs WORKFLOW_POSTGRES_URL pointing at a database with the workflow schema.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";

const url = process.env.WORKFLOW_POSTGRES_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb("world reader (real Postgres)", () => {
	let sql: SQL;
	const runId = `wrun_test_${Date.now()}`;
	const streamId = `${runId.replace(/^wrun_/, "strm_")}_user`;
	let chunkSeq = 0;
	const chunkId = () =>
		`chnk_${String(Date.now()).padStart(13, "0")}${String(chunkSeq++).padStart(6, "0")}`;

	const insertEvent = async (event: Record<string, unknown>, eof = false) => {
		const data = Buffer.from(`${JSON.stringify(event)}\n`);
		await sql`insert into workflow.workflow_stream_chunks (id, stream_id, run_id, data, eof)
			values (${chunkId()}, ${streamId}, ${runId}, ${data}, ${eof})`;
	};

	beforeAll(async () => {
		sql = new SQL(url as string);
		await sql`insert into workflow.workflow_runs (id, deployment_id, status, name)
			values (${runId}, 'test', 'running', 'test') on conflict do nothing`;
	});

	afterAll(async () => {
		await sql`delete from workflow.workflow_stream_chunks where run_id = ${runId}`;
		await sql`delete from workflow.workflow_runs where id = ${runId}`;
		await sql.close();
	});

	test("exact event count and cursor-based replay", async () => {
		const { readSessionEvents, sessionEventCount, sessionStreamName } =
			await import("../../src/internal/agentRuntime/eve/world.js");
		expect(sessionStreamName(runId)).toBe(streamId);

		await insertEvent({ type: "turn.started" });
		await insertEvent({ message: "hi", type: "message.completed" });
		await insertEvent({ type: "session.waiting" });
		// eve closes a stream with a separate, empty EOF marker chunk.
		await sql`insert into workflow.workflow_stream_chunks (id, stream_id, run_id, data, eof)
			values (${chunkId()}, ${streamId}, ${runId}, ${Buffer.alloc(0)}, true)`;

		expect(await sessionEventCount(runId)).toBe(3);

		const seen: string[] = [];
		for await (const event of readSessionEvents({
			sessionId: runId,
			startIndex: 1,
		})) {
			seen.push(event.type);
		}
		expect(seen).toEqual(["message.completed", "session.waiting"]);
	});
});
