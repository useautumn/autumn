import type { Context } from "hono";
import { benchPrimitives } from "../../diagnostics/benchPrimitives.js";
import { profileProcess } from "../../diagnostics/profileProcess.js";

/** Diagnostics for staging: what one serving thread spends its CPU on. Only timings, sizes and function names leave. */
export const receiveProfile = async (context: Context) =>
	context.json(
		await profileProcess({
			seconds: Number(context.req.query("seconds") ?? 10),
			intervalMicros: Number(context.req.query("interval_us") ?? 500),
		}),
	);

export const receiveBench =
	({ dataDir }: { dataDir: string }) =>
	(context: Context) =>
		context.json(benchPrimitives({ dataDir }));

const FLOOR_REPLY = { ok: true };

/** The same server, middleware and JSON reply as a check, with no work: the HTTP floor of a request. */
export const receiveFloor = (context: Context) => context.json(FLOOR_REPLY);
