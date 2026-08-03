import { createHash } from "node:crypto";
import type { Attributes } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

const MAX_TRACKED_QUERY_IDS = 4096;
const SLOW_QUERY_STATEMENT_THRESHOLD_MS = 100;

const getQueryId = ({ statement }: { statement: string }) =>
	createHash("sha256").update(statement).digest("hex").slice(0, 16);

const getDurationMs = ({ span }: { span: ReadableSpan }) =>
	span.duration[0] * 1000 + span.duration[1] / 1_000_000;

const withAttributes = ({
	span,
	attributes,
}: {
	span: ReadableSpan;
	attributes: Attributes;
}): ReadableSpan => ({
	name: span.name,
	kind: span.kind,
	spanContext: () => span.spanContext(),
	parentSpanContext: span.parentSpanContext,
	startTime: span.startTime,
	endTime: span.endTime,
	status: span.status,
	attributes,
	links: span.links,
	events: span.events,
	duration: span.duration,
	ended: span.ended,
	resource: span.resource,
	instrumentationScope: span.instrumentationScope,
	droppedAttributesCount: span.droppedAttributesCount,
	droppedEventsCount: span.droppedEventsCount,
	droppedLinksCount: span.droppedLinksCount,
});

export class SpanIngestCompactor {
	private readonly seenQueryIds = new Set<string>();

	compact({ span }: { span: ReadableSpan }): ReadableSpan {
		const statement = span.attributes["db.statement"];
		if (
			!span.name.startsWith("drizzle.") ||
			typeof statement !== "string" ||
			statement.length === 0
		) {
			return span;
		}

		const queryId = getQueryId({ statement });
		const attributes: Attributes = {
			...span.attributes,
			"db.query_id": queryId,
		};

		if (!this.seenQueryIds.has(queryId)) {
			if (this.seenQueryIds.size >= MAX_TRACKED_QUERY_IDS) {
				const oldestQueryId = this.seenQueryIds.values().next().value;
				if (oldestQueryId) this.seenQueryIds.delete(oldestQueryId);
			}
			this.seenQueryIds.add(queryId);
			attributes["db.query_definition"] = true;
			return withAttributes({ span, attributes });
		}

		if (getDurationMs({ span }) < SLOW_QUERY_STATEMENT_THRESHOLD_MS) {
			delete attributes["db.statement"];
		}
		return withAttributes({ span, attributes });
	}
}
