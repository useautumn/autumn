import { createHash } from "node:crypto";
import type { Attributes } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

const MAX_TRACKED_QUERY_IDS = 4096;

const getQueryId = ({ statement }: { statement: string }) =>
	createHash("sha256").update(statement).digest("hex").slice(0, 16);

const withAttributes = ({
	span,
	attributes,
}: {
	span: ReadableSpan;
	attributes: Attributes;
}): ReadableSpan =>
	new Proxy(span, {
		get(target, property) {
			if (property === "attributes") return attributes;

			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
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

		delete attributes["db.statement"];
		return withAttributes({ span, attributes });
	}
}
