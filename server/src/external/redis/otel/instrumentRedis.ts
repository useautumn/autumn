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
import { buildRedisSpanOutcomeAttributes } from "./redisSpanOutcomeAttributes.js";

const TRACER_NAME = "autumn.redis";
const INSTRUMENTED = new WeakSet<object>();

export type RedisClientType =
	| "subject-primary"
	| "subject-secondary"
	| `subject-dedicated:${string}`
	| "misc-primary"
	| "misc-secondary";

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
	"script",
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
	redisType: RedisClientType;
	key?: string;
};

const finalizeSpan = ({
	spanCtx,
	error,
}: {
	spanCtx: SpanContext;
	error?: unknown;
}) => {
	const {
		span,
		startedAt,
		thresholds,
		keyContext,
		operation,
		region,
		redisType,
		key,
	} = spanCtx;
	try {
		const durationMs = performance.now() - startedAt;
		span.setAttributes(
			buildRedisSpanOutcomeAttributes({
				durationMs,
				slowMs: thresholds.slowMs,
			}),
		);

		if (durationMs > thresholds.severeMs) {
			span.setAttribute("db.redis.severe", true);
			emitRedisSlowLog({
				operation,
				durationMs,
				thresholds,
				keyContext,
				region,
				redisType,
				key,
			});
		}
	} catch {}

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
	} catch {}
};

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

const truncateKey = (key: string): string =>
	key.length > 200 ? `${key.slice(0, 200)}...` : key;

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

const wrapPipelineExec = ({
	pipeline,
	tracer,
	region,
	redisType,
	kind,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: ioredis Pipeline/Multi shape varies
	pipeline: any;
	tracer: Tracer;
	region?: string;
	redisType: RedisClientType;
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
			span.setAttribute("db.redis.type", redisType);

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
				redisType,
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

const wrapCustomCommand = ({
	redis,
	name,
	tracer,
	region,
	redisType,
}: {
	redis: Redis;
	name: string;
	tracer: Tracer;
	region?: string;
	redisType: RedisClientType;
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
			span.setAttribute("db.redis.type", redisType);

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
				redisType,
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
	redisType,
}: {
	redis: Redis;
	region?: string;
	redisType: RedisClientType;
}): Redis => {
	if (!otelConfig.redis) return redis;
	if (INSTRUMENTED.has(redis)) return redis;
	INSTRUMENTED.add(redis);

	const tracer = trace.getTracer(TRACER_NAME);

	const originalSendCommand = redis.sendCommand;

	redis.sendCommand = function patchedSendCommand(
		this: Redis,
		command: Command,
		stream?: Parameters<Redis["sendCommand"]>[1],
	): unknown {
		const commandName = (command?.name || "unknown").toLowerCase();

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
			span.setAttribute("db.redis.type", redisType);

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
				redisType,
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

	const originalPipeline = redis.pipeline.bind(redis);
	redis.pipeline = function patchedPipeline(
		this: Redis,
		...args: Parameters<Redis["pipeline"]>
	) {
		const pipeline = originalPipeline(...args);
		try {
			wrapPipelineExec({
				pipeline,
				tracer,
				region,
				redisType,
				kind: "pipeline",
			});
		} catch {}
		return pipeline;
	} as Redis["pipeline"];

	const originalMulti = redis.multi.bind(redis);
	redis.multi = function patchedMulti(
		this: Redis,
		...args: Parameters<Redis["multi"]>
	) {
		const multi = originalMulti(...args);
		try {
			wrapPipelineExec({
				pipeline: multi,
				tracer,
				region,
				redisType,
				kind: "multi",
			});
		} catch {}
		return multi;
	} as Redis["multi"];

	const originalDefineCommand = redis.defineCommand.bind(redis);

	redis.defineCommand = function patchedDefineCommand(
		name: string,
		definition: { numberOfKeys?: number; lua: string; readOnly?: boolean },
	) {
		originalDefineCommand(name, definition);
		try {
			wrapCustomCommand({ redis, name, tracer, region, redisType });
		} catch {}
	};

	return redis;
};
