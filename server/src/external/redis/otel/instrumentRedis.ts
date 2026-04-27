import {
	context,
	type Span,
	SpanKind,
	SpanStatusCode,
	type Tracer,
	trace,
} from "@opentelemetry/api";
import type { Command, Redis } from "ioredis";
import { otelConfig } from "@/utils/otel/otelConfig.js";
import { emitRedisSlowLog } from "./emitRedisSlowLog.js";
import {
	parseRedisKeyContext,
	type RedisKeyContext,
} from "./parseRedisKeyContext.js";
import {
	type ResolvedThresholds,
	resolveThresholds,
} from "./redisSlowlogConfig.js";

const TRACER_NAME = "autumn.redis";
const INSTRUMENTED = new WeakSet<object>();

/** Commands that are noisy/internal — not worth tracing. */
const SKIP_COMMANDS = new Set([
	"ping",
	"auth",
	"select",
	"info",
	"client",
	"subscribe",
	"unsubscribe",
	"psubscribe",
	"punsubscribe",
	"quit",
	"disconnect",
	"cluster",
	"command",
	// SCRIPT LOAD / FLUSH / EXISTS fires rarely on connection bootstrap and
	// can spike into 100s of ms — noise that swamps the slowlog.
	"script",
	// Custom Lua commands are traced via defineCommand wrapper,
	// so skip the underlying evalsha/eval to avoid double-spanning.
	"evalsha",
	"eval",
]);

type SpanContext = {
	span: Span;
	startedAt: number;
	thresholds: ResolvedThresholds;
	keyContext: RedisKeyContext;
	operation: string;
	region?: string;
	key?: string;
};

/** Ends a span safely — never throws. */
const finalizeSpan = ({
	spanCtx,
	error,
}: {
	spanCtx: SpanContext;
	error?: unknown;
}) => {
	const { span, startedAt, thresholds, keyContext, operation, region, key } =
		spanCtx;
	try {
		const durationMs = performance.now() - startedAt;
		span.setAttribute("db.redis.duration_ms", durationMs);

		if (durationMs > thresholds.slowMs) {
			span.setAttribute("db.redis.slow", true);
			span.setAttribute(
				"db.redis.breach_ratio",
				thresholds.slowMs > 0 ? durationMs / thresholds.slowMs : 0,
			);
		}

		if (durationMs > thresholds.severeMs) {
			emitRedisSlowLog({
				operation,
				durationMs,
				thresholds,
				keyContext,
				region,
				key,
			});
		}
	} catch {
		// swallow — never mask application results
	}

	try {
		if (error) {
			span.setStatus({ code: SpanStatusCode.ERROR });
			if (error instanceof Error) {
				span.recordException(error);
			} else {
				span.recordException(new Error(String(error)));
			}
		} else {
			span.setStatus({ code: SpanStatusCode.OK });
		}
		span.end();
	} catch {
		// swallow — never mask application results
	}
};

/**
 * Extracts the first key argument from a Redis command's args.
 * For most commands, args[0] is the key. Custom Lua commands registered
 * without `numberOfKeys` (e.g. `setCachedFullSubject`) pass the key count
 * as args[0] and the first real key at args[1]. Returns undefined for
 * keyless commands or evalsha (where args[0] is a SHA hash).
 */
export const extractKey = ({
	args,
}: {
	args: unknown[];
}): string | undefined => {
	if (args.length === 0) return undefined;

	const candidate = typeof args[0] === "number" ? args[1] : args[0];
	if (typeof candidate === "string") return candidate;
	if (Buffer.isBuffer(candidate)) return candidate.toString("utf8");
	return undefined;
};

/** Truncates a key for `db.statement` (Axiom trace attribute size limit). */
const truncateKey = (key: string): string =>
	key.length > 200 ? `${key.slice(0, 200)}...` : key;

/**
 * Applies SLO threshold + key-context attributes to a fresh span.
 * Isolated in a try/catch so partial-enrichment failures don't prevent
 * the command from running.
 */
const enrichSpan = ({
	span,
	operation,
	region,
	key,
}: {
	span: Span;
	operation: string;
	region?: string;
	key?: string;
}): {
	thresholds: ResolvedThresholds;
	keyContext: RedisKeyContext;
} => {
	const thresholds = resolveThresholds({ operation, redisRegion: region });
	span.setAttribute("db.redis.slow_ms", thresholds.slowMs);
	span.setAttribute("db.redis.base_slow_ms", thresholds.baseSlowMs);
	span.setAttribute("db.redis.region_baseline_ms", thresholds.regionBaselineMs);
	span.setAttribute("db.redis.severe_ms", thresholds.severeMs);

	const keyContext = parseRedisKeyContext({ key });
	if (keyContext.orgId) span.setAttribute("db.redis.org_id", keyContext.orgId);
	if (keyContext.customerId)
		span.setAttribute("db.redis.customer_id", keyContext.customerId);
	if (keyContext.entityId)
		span.setAttribute("db.redis.entity_id", keyContext.entityId);
	if (keyContext.generation)
		span.setAttribute("db.redis.cache_gen", keyContext.generation);

	return { thresholds, keyContext };
};

/**
 * Wraps the `exec()` of an ioredis Pipeline or Multi so the batched round trip
 * shows up as a single parent span (`redis.pipeline` / `redis.multi`) in
 * Axiom. Individual command spans continue to fire for each queued command;
 * this span gives us total batch latency and a command-count attribute so we
 * can tell at a glance whether a request was pipelined.
 */
const wrapPipelineExec = ({
	pipeline,
	tracer,
	region,
	kind,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: ioredis Pipeline/Multi shape varies
	pipeline: any;
	tracer: Tracer;
	region?: string;
	kind: "pipeline" | "multi";
}) => {
	const originalExec = pipeline.exec;
	if (typeof originalExec !== "function") return;

	pipeline.exec = function patchedExec(this: unknown, ...execArgs: unknown[]) {
		let spanCtx: SpanContext;
		try {
			const span = tracer.startSpan(`redis.${kind}`, {
				kind: SpanKind.CLIENT,
			});
			span.setAttribute("db.system", "redis");
			span.setAttribute("db.operation", kind.toUpperCase());
			if (region) span.setAttribute("db.redis.region", region);

			// biome-ignore lint/suspicious/noExplicitAny: ioredis internal queue
			const queue = (pipeline as any)._queue;
			const commandCount = Array.isArray(queue)
				? queue.length
				: typeof pipeline.length === "number"
					? pipeline.length
					: undefined;
			if (typeof commandCount === "number") {
				span.setAttribute("db.redis.pipeline.command_count", commandCount);
			}
			if (Array.isArray(queue)) {
				const names = queue
					// biome-ignore lint/suspicious/noExplicitAny: ioredis internal queue entries
					.map((q: any) => q?.name)
					.filter((n: unknown): n is string => typeof n === "string")
					.slice(0, 20)
					.join(",");
				if (names) span.setAttribute("db.redis.pipeline.commands", names);
			}

			const { thresholds, keyContext } = enrichSpan({
				span,
				operation: kind,
				region,
			});

			spanCtx = {
				span,
				startedAt: performance.now(),
				thresholds,
				keyContext,
				operation: kind,
				region,
			};
		} catch {
			return originalExec.apply(this, execArgs);
		}

		const activeContext = trace.setSpan(context.active(), spanCtx.span);

		try {
			const result = context.with(activeContext, () =>
				originalExec.apply(this, execArgs),
			);

			if (result && typeof (result as Promise<unknown>).then === "function") {
				(result as Promise<unknown>).then(
					() => {
						finalizeSpan({ spanCtx });
					},
					(err) => {
						finalizeSpan({ spanCtx, error: err });
					},
				);
				return result;
			}

			finalizeSpan({ spanCtx });
			return result;
		} catch (err) {
			finalizeSpan({ spanCtx, error: err });
			throw err;
		}
	};
};

/** Wraps a custom command method created by defineCommand with a traced version. */
const wrapCustomCommand = ({
	redis,
	name,
	tracer,
	region,
}: {
	redis: Redis;
	name: string;
	tracer: Tracer;
	region?: string;
}) => {
	// biome-ignore lint: dynamic property access for custom redis commands
	const original = (redis as any)[name] as
		| ((...a: unknown[]) => unknown)
		| undefined;
	if (typeof original !== "function") return;

	// biome-ignore lint: dynamic property assignment for custom redis commands
	(redis as any)[name] = function (this: Redis, ...args: unknown[]) {
		let spanCtx: SpanContext;
		try {
			const span = tracer.startSpan(`redis.${name}`, {
				kind: SpanKind.CLIENT,
			});
			span.setAttribute("db.system", "redis");
			span.setAttribute("db.operation", name);
			if (region) span.setAttribute("db.redis.region", region);

			const key = extractKey({ args });
			if (key) span.setAttribute("db.statement", truncateKey(key));

			const { thresholds, keyContext } = enrichSpan({
				span,
				operation: name,
				region,
				key,
			});

			spanCtx = {
				span,
				startedAt: performance.now(),
				thresholds,
				keyContext,
				operation: name,
				region,
				key,
			};
		} catch {
			return original.apply(this, args);
		}

		const activeContext = trace.setSpan(context.active(), spanCtx.span);

		try {
			const result = context.with(activeContext, () =>
				original.apply(this, args),
			);

			if (result && typeof (result as Promise<unknown>).then === "function") {
				(result as Promise<unknown>).then(
					() => {
						finalizeSpan({ spanCtx });
					},
					(err) => {
						finalizeSpan({ spanCtx, error: err });
					},
				);
				return result;
			}

			finalizeSpan({ spanCtx });
			return result;
		} catch (err) {
			finalizeSpan({ spanCtx, error: err });
			throw err;
		}
	};
};

/**
 * Patches an ioredis instance to create OTel spans for every command.
 *
 * - `sendCommand` is patched for built-in commands (GET, SET, etc.)
 * - `defineCommand` is patched so custom Lua commands get spans
 *   with their real name (e.g. `redis.getCustomer`) instead of `redis.evalsha`.
 *
 * Must be called BEFORE defineCommand calls (i.e. before configureRedisInstance).
 *
 * Fail-open: if OTel throws, the original command runs unmodified.
 * Memory-safe: no request-scoped state held in closures.
 */
export const instrumentRedis = ({
	redis,
	region,
}: {
	redis: Redis;
	region?: string;
}): Redis => {
	if (!otelConfig.redis) return redis;
	if (INSTRUMENTED.has(redis)) return redis;
	INSTRUMENTED.add(redis);

	const tracer = trace.getTracer(TRACER_NAME);

	// --- Patch sendCommand for built-in commands (GET, SET, HGET, etc.) ---
	const originalSendCommand = redis.sendCommand;

	redis.sendCommand = function patchedSendCommand(
		this: Redis,
		command: Command,
		stream?: Parameters<Redis["sendCommand"]>[1],
	): unknown {
		const commandName = (command?.name || "unknown").toLowerCase();

		// Skip noisy/internal commands and evalsha (traced via defineCommand wrapper)
		if (SKIP_COMMANDS.has(commandName)) {
			return originalSendCommand.call(this, command, stream);
		}

		let spanCtx: SpanContext;
		try {
			const span = tracer.startSpan(`redis.${commandName}`, {
				kind: SpanKind.CLIENT,
			});
			span.setAttribute("db.system", "redis");
			span.setAttribute("db.operation", commandName.toUpperCase());
			if (region) span.setAttribute("db.redis.region", region);

			const key = extractKey({ args: command?.args ?? [] });
			if (key) span.setAttribute("db.statement", truncateKey(key));

			const { thresholds, keyContext } = enrichSpan({
				span,
				operation: commandName,
				region,
				key,
			});

			spanCtx = {
				span,
				startedAt: performance.now(),
				thresholds,
				keyContext,
				operation: commandName,
				region,
				key,
			};
		} catch {
			return originalSendCommand.call(this, command, stream);
		}

		const activeContext = trace.setSpan(context.active(), spanCtx.span);

		try {
			const result = context.with(activeContext, () =>
				originalSendCommand.call(this, command, stream),
			);

			if (result && typeof (result as Promise<unknown>).then === "function") {
				(result as Promise<unknown>).then(
					() => {
						finalizeSpan({ spanCtx });
					},
					(err) => {
						finalizeSpan({ spanCtx, error: err });
					},
				);
				return result;
			}

			finalizeSpan({ spanCtx });
			return result;
		} catch (err) {
			finalizeSpan({ spanCtx, error: err });
			throw err;
		}
	};

	// --- Patch pipeline() and multi() so batched exec gets a parent span ---
	const originalPipeline = redis.pipeline.bind(redis);
	redis.pipeline = function patchedPipeline(
		this: Redis,
		...args: Parameters<Redis["pipeline"]>
	) {
		const pipeline = originalPipeline(...args);
		try {
			wrapPipelineExec({ pipeline, tracer, region, kind: "pipeline" });
		} catch {
			// Fail-open: wrapping failed, pipeline still works
		}
		return pipeline;
	} as Redis["pipeline"];

	const originalMulti = redis.multi.bind(redis);
	redis.multi = function patchedMulti(
		this: Redis,
		...args: Parameters<Redis["multi"]>
	) {
		const multi = originalMulti(...args);
		try {
			wrapPipelineExec({ pipeline: multi, tracer, region, kind: "multi" });
		} catch {
			// Fail-open: wrapping failed, multi still works
		}
		return multi;
	} as Redis["multi"];

	// --- Patch defineCommand so custom Lua commands get named spans ---
	const originalDefineCommand = redis.defineCommand.bind(redis);

	redis.defineCommand = function patchedDefineCommand(
		name: string,
		definition: { numberOfKeys?: number; lua: string; readOnly?: boolean },
	) {
		originalDefineCommand(name, definition);
		try {
			wrapCustomCommand({ redis, name, tracer, region });
		} catch {
			// Fail-open: wrapping failed, command still works via sendCommand
		}
	};

	return redis;
};
