import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ZodTypeAny, z } from "zod";
import {
	CreateRunBody,
	ListRunsQuery,
	type RunEvent,
	type RunFile,
	type WorkerState,
} from "../../api/contract.ts";
import type { RunStatus } from "../../db/schema/runs.ts";
import { cancelRun } from "../../internal/runs/actions/cancelRun.ts";
import { createRun } from "../../internal/runs/actions/createRun.ts";
import { getFileLog } from "../../internal/runs/actions/getFileLog.ts";
import { getRun } from "../../internal/runs/actions/getRun.ts";
import { listRuns } from "../../internal/runs/actions/listRuns.ts";
import { rerunFailed } from "../../internal/runs/actions/rerunFailed.ts";
import {
	getLiveRun,
	subscribeRunEvents,
} from "../../internal/runs/live/liveRuns.ts";
import {
	getRunWithEmail,
	isTerminalRunStatus,
} from "../../internal/runs/repos/runsRepo.ts";
import { readRunProgress } from "../../internal/runs/types/runProgress.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

const DB_POLL_MS = 2_000;
const PING_MS = 15_000;

const parse = <S extends ZodTypeAny>({
	schema,
	input,
}: {
	schema: S;
	input: unknown;
}): z.output<S> => {
	const result = schema.safeParse(input);
	if (result.success) return result.data;
	throw new TwdError({
		status: 400,
		code: "invalid_request",
		message: result.error.issues
			.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
			.join("; "),
		next: "Fix the request to match src/api/contract.ts and retry.",
	});
};

export const runsRoutes = new Hono<TwdHono>()
	.get("/runs", async (c) =>
		c.json(
			await listRuns({
				ctx: c.get("ctx"),
				...parse({ schema: ListRunsQuery, input: c.req.query() }),
			}),
		),
	)
	.post("/runs", async (c) => {
		const body = parse({
			schema: CreateRunBody,
			input: await c.req.json().catch(() => undefined),
		});
		return c.json(await createRun({ ctx: c.get("ctx"), ...body }), 201);
	})
	.get("/runs/:id", async (c) =>
		c.json(await getRun({ ctx: c.get("ctx"), runId: c.req.param("id") })),
	)
	.get("/runs/:id/files/log", async (c) => {
		const file = c.req.query("file");
		if (!file) {
			throw new TwdError({
				status: 400,
				code: "invalid_request",
				message: "Missing ?file= (server/tests-relative path).",
				next: "GET /runs/:id lists the run's files.",
			});
		}
		return c.text(
			await getFileLog({ ctx: c.get("ctx"), runId: c.req.param("id"), file }),
		);
	})
	.post("/runs/:id/cancel", async (c) =>
		c.json(await cancelRun({ ctx: c.get("ctx"), runId: c.req.param("id") })),
	)
	.post("/runs/:id/rerun-failed", async (c) =>
		c.json(
			await rerunFailed({ ctx: c.get("ctx"), runId: c.req.param("id") }),
			201,
		),
	)
	.get("/runs/:id/events", async (c) => {
		const ctx = c.get("ctx");
		const runId = c.req.param("id");
		await getRunWithEmail({ ctx, runId });
		// Replays the current snapshot, then streams live events until a terminal status.
		return streamSSE(c, async (stream) => {
			let chain = Promise.resolve();
			const send = (event: RunEvent) => {
				chain = chain.then(() =>
					stream.writeSSE({ event: event.type, data: JSON.stringify(event) }),
				);
			};
			const replay = ({
				status,
				phase,
				workers,
				files,
			}: {
				status: RunStatus;
				phase: string | null;
				workers: Iterable<WorkerState>;
				files: Iterable<RunFile>;
			}) => {
				send({ type: "status", status, phase });
				for (const worker of workers) send({ type: "worker", worker });
				for (const file of files) send({ type: "file", file });
			};

			let finish = () => {};
			const finished = new Promise<void>((resolve) => {
				finish = resolve;
			});
			stream.onAbort(finish);
			const ping = setInterval(() => {
				chain = chain
					.then(() => stream.write(": ping\n\n"))
					.then(() => undefined);
			}, PING_MS);

			let lastStatus: RunStatus | undefined;
			while (!stream.aborted) {
				const live = getLiveRun({ runId });
				if (live) {
					replay({
						status: live.status,
						phase: live.phase,
						workers: live.workers.values(),
						files: live.files.values(),
					});
					const unsubscribe = subscribeRunEvents({
						runId,
						listener: (event) => {
							send(event);
							if (event.type === "status" && isTerminalRunStatus(event))
								finish();
						},
					});
					if (isTerminalRunStatus(live)) finish();
					await finished;
					unsubscribe();
					break;
				}
				const { run } = await getRunWithEmail({ ctx, runId });
				const progress = readRunProgress({ progress: run.progress });
				if (lastStatus === undefined) {
					replay({
						status: run.status,
						phase: progress.phase ?? null,
						workers: progress.workers ?? [],
						files: progress.files ?? [],
					});
				} else if (run.status !== lastStatus) {
					send({
						type: "status",
						status: run.status,
						phase: progress.phase ?? null,
					});
				}
				lastStatus = run.status;
				if (isTerminalRunStatus(run)) break;
				await Promise.race([finished, Bun.sleep(DB_POLL_MS)]);
			}
			clearInterval(ping);
			await chain;
		});
	});
