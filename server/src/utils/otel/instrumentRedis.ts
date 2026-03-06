import {
	context,
	type Span,
	SpanKind,
	SpanStatusCode,
	type Tracer,
	trace,
} from "@opentelemetry/api";
import type { Command, Redis } from "ioredis";
import { otelConfig } from "./otelConfig.js";

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
	// Custom Lua commands are traced via defineCommand wrapper,
	// so skip the underlying evalsha/eval to avoid double-spanning.
	"evalsha",
	"eval",
]);

/** Ends a span safely — never throws. */
const finalizeSpan = ({ span, error }: { span: Span; error?: unknown }) => {
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
 * For most commands, args[0] is the key. Returns undefined for
 * keyless commands or evalsha (where args[0] is a SHA hash).
 */
const extractKey = ({ args }: { args: unknown[] }): string | undefined => {
	if (args.length === 0) return undefined;

	const firstArg = args[0];
	if (typeof firstArg === "string") return firstArg;
	if (Buffer.isBuffer(firstArg)) return firstArg.toString("utf8");
	return undefined;
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
		let span: Span;
		try {
			span = tracer.startSpan(`redis.${name}`, {
				kind: SpanKind.CLIENT,
			});
			span.setAttribute("db.system", "redis");
			span.setAttribute("db.operation", name);
			if (region) span.setAttribute("db.redis.region", region);
		} catch {
			return original.apply(this, args);
		}

		const activeContext = trace.setSpan(context.active(), span);

		try {
			const result = context.with(activeContext, () =>
				original.apply(this, args),
			);

			if (result && typeof (result as Promise<unknown>).then === "function") {
				return (result as Promise<unknown>).then(
					(val) => {
						finalizeSpan({ span });
						return val;
					},
					(err) => {
						finalizeSpan({ span, error: err });
						throw err;
					},
				);
			}

			finalizeSpan({ span });
			return result;
		} catch (err) {
			finalizeSpan({ span, error: err });
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

		let span: Span;
		try {
			span = tracer.startSpan(`redis.${commandName}`, {
				kind: SpanKind.CLIENT,
			});
			span.setAttribute("db.system", "redis");
			span.setAttribute("db.operation", commandName.toUpperCase());

			if (region) {
				span.setAttribute("db.redis.region", region);
			}

			const key = extractKey({
				args: command?.args ?? [],
			});
			if (key) {
				span.setAttribute(
					"db.statement",
					key.length > 200 ? `${key.slice(0, 200)}...` : key,
				);
			}
		} catch {
			return originalSendCommand.call(this, command, stream);
		}

		const activeContext = trace.setSpan(context.active(), span);

		try {
			const result = context.with(activeContext, () =>
				originalSendCommand.call(this, command, stream),
			);

			if (result && typeof (result as Promise<unknown>).then === "function") {
				return (result as Promise<unknown>).then(
					(val) => {
						finalizeSpan({ span });
						return val;
					},
					(err) => {
						finalizeSpan({ span, error: err });
						throw err;
					},
				);
			}

			finalizeSpan({ span });
			return result;
		} catch (err) {
			finalizeSpan({ span, error: err });
			throw err;
		}
	};

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
