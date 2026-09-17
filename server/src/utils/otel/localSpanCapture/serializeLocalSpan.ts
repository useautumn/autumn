import { createHash } from "node:crypto";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

const safeNames = new Set([
	"stripe.api",
	"stripe.webhook.deferred",
	"dynamodb.claim_idempotency_key",
	"dynamodb.release_idempotency_key",
	..."select insert update delete with begin commit rollback execute"
		.split(" ")
		.map((name) => `drizzle.${name}`),
	..."get set del unlink exists expire pexpire ttl pttl mget mset hget hset hdel hgetall hmget incr incrby decr decrby zadd zrem zrange zcard sadd srem smembers scard pipeline multi exec scan"
		.split(" ")
		.map((name) => `redis.${name}`),
	..."deductFromSubjectBalances updateSubjectBalances rollUsageWindows setCachedFullSubject publishCachedFullSubject updateFullSubjectCustomerDataV2 updateFullSubjectEntityDataV2 getDelFullSubjectBalanceFields updateFullSubjectCustomerProductV2 upsertInvoiceInFullSubjectV2 adjustSubjectBalance deleteOwnedLock refreshOwnedLock acquireQueuePermits releaseQueuePermit"
		.split(" ")
		.map((name) => `redis.${name}`),
]);

const safeEnums: Record<string, readonly string[]> = {
	"http.request.method": [
		"GET",
		"POST",
		"PUT",
		"PATCH",
		"DELETE",
		"HEAD",
		"OPTIONS",
	],
	"db.system": ["postgresql", "redis", "dynamodb"],
	"db.operation": [
		"SELECT",
		"INSERT",
		"UPDATE",
		"DELETE",
		"WITH",
		"BEGIN",
		"COMMIT",
		"ROLLBACK",
		"EXECUTE",
	],
	"dynamodb.outcome": ["claimed", "released", "duplicate", "unavailable"],
};

export const serializeLocalSpan = ({ span }: { span: ReadableSpan }) => {
	const attributes: Record<string, string | number | boolean> = {};
	for (const [key, allowed] of Object.entries(safeEnums)) {
		const value = span.attributes[key];
		if (typeof value === "string" && allowed.includes(value))
			attributes[key] = value;
	}
	const statusCode = span.attributes["http.response.status_code"];
	if (
		typeof statusCode === "number" &&
		Number.isInteger(statusCode) &&
		statusCode >= 100 &&
		statusCode <= 599
	) {
		attributes["http.response.status_code"] = statusCode;
	}
	for (const key of ["db.redis.slow", "db.redis.severe"]) {
		const value = span.attributes[key];
		if (typeof value === "boolean") attributes[key] = value;
	}
	const name = safeNames.has(span.name)
		? span.name
		: `redacted.${createHash("sha256").update(span.name).digest("hex").slice(0, 16)}`;
	return {
		version: 1,
		processId: process.pid,
		traceId: span.spanContext().traceId,
		spanId: span.spanContext().spanId,
		parentSpanId: span.parentSpanContext?.spanId ?? null,
		name,
		kind: span.kind,
		startTime: span.startTime,
		endTime: span.endTime,
		durationMs: span.duration[0] * 1000 + span.duration[1] / 1_000_000,
		status: { code: span.status.code },
		attributes,
	};
};
