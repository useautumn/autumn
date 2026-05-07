import {
	type Attributes,
	type Histogram,
	type HrTime,
	metrics,
	SpanStatusCode,
} from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

const METER_NAME = "autumn-server";
const UNKNOWN = "unknown";
const DURATION_BUCKETS_MS = [
	1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 30_000,
];

type DurationHistograms = {
	http: Histogram;
	redis: Histogram;
	db: Histogram;
	worker: Histogram;
};

let histograms: DurationHistograms | null = null;

const getHistograms = (): DurationHistograms => {
	if (histograms) return histograms;

	const meter = metrics.getMeter(METER_NAME);
	histograms = {
		http: meter.createHistogram("autumn.http.server.duration_ms", {
			advice: { explicitBucketBoundaries: DURATION_BUCKETS_MS },
			description: "HTTP request duration before trace export sampling",
			unit: "ms",
		}),
		redis: meter.createHistogram("autumn.redis.command.duration_ms", {
			advice: { explicitBucketBoundaries: DURATION_BUCKETS_MS },
			description: "Redis command duration before trace export sampling",
			unit: "ms",
		}),
		db: meter.createHistogram("autumn.db.query.duration_ms", {
			advice: { explicitBucketBoundaries: DURATION_BUCKETS_MS },
			description: "Database query duration before trace export sampling",
			unit: "ms",
		}),
		worker: meter.createHistogram("autumn.worker.duration_ms", {
			advice: { explicitBucketBoundaries: DURATION_BUCKETS_MS },
			description: "Worker execution duration before trace export sampling",
			unit: "ms",
		}),
	};

	return histograms;
};

const hrTimeToMilliseconds = ([seconds, nanos]: HrTime): number =>
	seconds * 1000 + nanos / 1_000_000;

const stringAttr = (
	attributes: ReadableSpan["attributes"],
	key: string,
	fallback = UNKNOWN,
) => {
	const value = attributes[key];
	return typeof value === "string" && value.length > 0 ? value : fallback;
};

const numberAttr = (attributes: ReadableSpan["attributes"], key: string) => {
	const value = attributes[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
};

const statusLabel = (span: ReadableSpan) =>
	span.status.code === SpanStatusCode.ERROR ? "error" : "ok";

const statusClass = (statusCode: number | undefined) => {
	if (!statusCode) return UNKNOWN;
	return `${Math.floor(statusCode / 100)}xx`;
};

const normalizedRoute = (route: string) =>
	route
		.replace(
			/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
			":id",
		)
		.replace(
			/\b(?:cus|org|ent|prod|feat|user|sub|msg)_[A-Za-z0-9_-]+\b/g,
			":id",
		);

const httpMethods = new Set([
	"DELETE",
	"GET",
	"PATCH",
	"POST",
	"PUT",
	"OPTIONS",
	"HEAD",
]);

const httpAttributes = (span: ReadableSpan): Attributes | null => {
	const [methodFromName] = span.name.split(" ");
	const method = stringAttr(
		span.attributes,
		"http.request.method",
		methodFromName,
	);
	if (!httpMethods.has(method)) return null;
	const route = span.name.startsWith(`${methodFromName} `)
		? span.name.slice(methodFromName.length + 1)
		: span.name;

	return {
		env: stringAttr(span.attributes, "env"),
		method,
		route: normalizedRoute(route),
		status_class: statusClass(
			numberAttr(span.attributes, "http.response.status_code") ??
				numberAttr(span.attributes, "http.status_code"),
		),
	};
};

const redisAttributes = (span: ReadableSpan): Attributes | null => {
	if (!span.name.startsWith("redis.")) return null;

	return {
		env: stringAttr(span.attributes, "env"),
		operation: span.name.slice("redis.".length) || UNKNOWN,
		region: stringAttr(span.attributes, "db.redis.region"),
		slow: span.attributes["db.redis.slow"] === true,
		status: statusLabel(span),
	};
};

const dbAttributes = (span: ReadableSpan): Attributes | null => {
	if (!span.name.startsWith("drizzle.")) return null;

	return {
		env: stringAttr(span.attributes, "env"),
		operation: span.name.slice("drizzle.".length) || UNKNOWN,
		status: statusLabel(span),
	};
};

const workerAttributes = (span: ReadableSpan): Attributes | null => {
	if (!span.name.startsWith("worker.")) return null;

	return {
		env: stringAttr(span.attributes, "env"),
		worker: span.name.slice("worker.".length) || UNKNOWN,
		status: statusLabel(span),
	};
};

export const recordSpanDurationMetric = (span: ReadableSpan) => {
	const durationMs = hrTimeToMilliseconds(span.duration);
	if (!Number.isFinite(durationMs) || durationMs < 0) return;

	const { http, redis, db, worker } = getHistograms();

	const redisAttrs = redisAttributes(span);
	if (redisAttrs) {
		redis.record(durationMs, redisAttrs);
		return;
	}

	const dbAttrs = dbAttributes(span);
	if (dbAttrs) {
		db.record(durationMs, dbAttrs);
		return;
	}

	const workerAttrs = workerAttributes(span);
	if (workerAttrs) {
		worker.record(durationMs, workerAttrs);
		return;
	}

	const httpAttrs = httpAttributes(span);
	if (httpAttrs) {
		http.record(durationMs, httpAttrs);
	}
};
