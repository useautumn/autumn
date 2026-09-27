import type { TrackCommand } from "@autumn/balance-engine";
import {
	type PartitionRoute,
	parseTrackBatchRequest,
	type TrackBatchItemResult,
	type TrackBatchReply,
	type TrackReply,
} from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import { readJsonRequestBody } from "../middlewares/requestValidationMiddleware.js";
import {
	PartitionRouteMismatchError,
	PartitionRouteNotOwnedError,
} from "../middlewares/runtimeRouting/runtimeRoutingErrors.js";
import type {
	BalanceWorkerBatchLog,
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
	BalanceWorkerRequestContext,
	BalanceWorkerRequestLog,
} from "../types/balanceWorkerHttp.js";
import { workerErrorOf } from "./errorHandler/workerErrorOf.js";

/**
 * Many tracks for one partition in one request, so parsing, routing and logging are
 * paid once per batch. Ownership is checked once; each command is validated and run on
 * its own, concurrently, so the writer coalesces them and one failure fails alone.
 */
export function receiveTrackBatch({ ctx }: { ctx: BalanceWorkerHttpContext }) {
	async function respond(context: Context<BalanceWorkerHttpEnv>) {
		const input = await readJsonRequestBody(context);
		const { route, commands } = parseTrackBatchRequest({ input });
		const owner = ctx.ownership.findRuntime(route);
		if (!owner) throw new PartitionRouteNotOwnedError();
		const runtime: Runtime = owner;

		function runCommand(input: unknown): Promise<TrackReply> {
			return runTrack({ ctx, runtime, input, route });
		}

		const settled = await Promise.allSettled(commands.map(runCommand));
		const results: TrackBatchItemResult[] = [];
		const causes: unknown[] = [];
		for (const outcome of settled) {
			if (outcome.status === "fulfilled") {
				results.push({ ok: true, reply: outcome.value });
				continue;
			}
			causes.push(outcome.reason);
			const { status, error } = workerErrorOf({ cause: outcome.reason });
			results.push({ ok: false, status, error });
		}
		recordBatch({
			requestLog: context.get("requestLog"),
			route,
			commands,
			results,
			causes,
		});
		return context.json({ results } satisfies TrackBatchReply);
	}
	return respond;
}

type Runtime = BalanceWorkerRequestContext["runtime"];

/** Exactly what `/v1/track` checks for one command, minus the ownership lookup the batch did once. */
async function runTrack({
	ctx,
	runtime,
	input,
	route,
}: {
	ctx: BalanceWorkerHttpContext;
	runtime: Runtime;
	input: unknown;
	route: { partition: number };
}): Promise<TrackReply> {
	// Our server builds and validates each command; re-parsing them here is pure cost, the same as on /v1/track.
	// A command that is not even shaped like a track fails alone, as its schema failure did.
	if (!looksLikeTrackCommand(input)) throw new HTTPException(400);
	const command = input;
	const partition = ctx.partitionResolver.partitionForIdentity({
		identity: command.identity,
	});
	if (partition !== route.partition) throw new PartitionRouteMismatchError();
	function track(processor: PartitionProcessor) {
		return processor.track({ command });
	}
	return runtime.process(track);
}

function looksLikeTrackCommand(input: unknown): input is TrackCommand {
	if (typeof input !== "object" || input === null) return false;
	const command = input as Partial<TrackCommand>;
	const identity = command.identity as
		| Partial<TrackCommand["identity"]>
		| undefined;
	return (
		command.schemaVersion === 1 &&
		command.type === "track" &&
		typeof command.commandId === "string" &&
		typeof identity === "object" &&
		identity !== null &&
		typeof identity.orgId === "string" &&
		typeof identity.env === "string" &&
		typeof identity.customerId === "string"
	);
}

/** Failures are counted by code; only one unexpected cause is kept, so a bad batch costs one stack. */
function recordBatch({
	requestLog,
	route,
	commands,
	results,
	causes,
}: {
	requestLog: BalanceWorkerRequestLog;
	route: PartitionRoute;
	commands: unknown[];
	results: TrackBatchItemResult[];
	causes: unknown[];
}): void {
	const batch: BalanceWorkerBatchLog = {
		route,
		count: results.length,
		succeeded: 0,
		failed: 0,
		errorCodes: {},
		worstStatus: 200,
		...identityOf({ commands }),
	};
	for (const result of results) {
		if (result.ok) {
			batch.succeeded++;
			continue;
		}
		batch.failed++;
		batch.errorCodes[result.error.code] =
			(batch.errorCodes[result.error.code] ?? 0) + 1;
		batch.worstStatus = Math.max(batch.worstStatus, result.status);
	}
	requestLog.batch = batch;
	for (const cause of causes) {
		if (!(cause instanceof Error)) continue;
		if (workerErrorOf({ cause }).status < 500) continue;
		requestLog.error = cause;
		break;
	}
}

/** Commands share a partition, not necessarily a customer, so only shared fields are logged. */
function identityOf({
	commands,
}: {
	commands: unknown[];
}): Pick<BalanceWorkerBatchLog, "identity" | "orgSlug"> {
	const first = commands[0] as Partial<TrackCommand> | undefined;
	const identity = first?.identity;
	if (!identity || typeof identity !== "object") return {};
	const shared: BalanceWorkerBatchLog["identity"] = {
		orgId: identity.orgId,
		env: identity.env,
	};
	let sameSubject = true;
	for (const command of commands) {
		const other = (command as Partial<TrackCommand> | null)?.identity;
		if (
			other?.customerId !== identity.customerId ||
			other?.entityId !== identity.entityId
		) {
			sameSubject = false;
			break;
		}
	}
	if (sameSubject) {
		shared.customerId = identity.customerId;
		shared.entityId = identity.entityId;
	}
	return { identity: shared, orgSlug: first?.org?.slug };
}
