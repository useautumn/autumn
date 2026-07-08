import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import {
	parseRestrictedApl,
	type RestrictedAplAst,
	type RestrictedAplExpr,
	type RestrictedAplField,
	RestrictedAplStageNotAllowedError,
} from "../parser/restrictedApl.js";
import type { RestrictedAplStageKind } from "../parser/restrictedAplConfig.js";

const days = (count: number) => count * 24 * 60 * 60 * 1000;

const SEARCH_MAX_RANGE_MS = days(7);
const QUERY_ORG_MAX_RANGE_MS = days(15);
const QUERY_CUSTOMER_MAX_RANGE_MS = days(30);
const DEFAULT_RANGE_MS = 30 * 60 * 1000;

const isoDateTimeString = z.string().refine((value) => {
	const date = new Date(value);
	return Number.isFinite(date.getTime());
}, "Expected an ISO datetime string");

export const LogsRangeSchema = z
	.object({
		start_date: isoDateTimeString.optional(),
		end_date: isoDateTimeString.optional(),
	})
	.strict();

const SEARCH_RANGE_HINT =
	"Search consecutive 7-day windows for longer periods, or use logs.query aggregates (up to 30 days with a customer_id filter).";

export const resolveLogsRange = ({
	startDate,
	endDate,
	defaultRangeMs = DEFAULT_RANGE_MS,
	maxRangeMs = SEARCH_MAX_RANGE_MS,
	maxRangeLabel = "7 days",
	maxRangeHint = SEARCH_RANGE_HINT,
	now = new Date(),
}: {
	startDate?: string;
	endDate?: string;
	defaultRangeMs?: number;
	maxRangeMs?: number;
	maxRangeLabel?: string;
	maxRangeHint?: string;
	now?: Date;
}) => {
	const end = endDate ? new Date(endDate) : now;
	const start = startDate
		? new Date(startDate)
		: new Date(end.getTime() - defaultRangeMs);

	if (start.getTime() >= end.getTime()) {
		throw new RecaseError({
			message: "range.start_date must be before range.end_date",
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (end.getTime() - start.getTime() > maxRangeMs) {
		throw new RecaseError({
			message: `Log range cannot exceed ${maxRangeLabel}. ${maxRangeHint}`,
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	return {
		startDate: start.toISOString(),
		endDate: end.toISOString(),
	};
};

const QUERYABLE_FIELDS_HINT =
	"Queryable fields: timestamp, source, status_code, request_method, request_url, request_path, request_body, response_body, org_id, customer_id, entity_id, stripe_event_id, stripe_event_type, stripe_object_id, plus dot paths like request_body.feature_id. For free-text matching use: where request_body contains 'text' or response_body contains 'text'.";

const logsQuerySyntaxHint = ({
	allowedStages,
}: {
	allowedStages: RestrictedAplStageKind[];
}): string => {
	const aggregate = allowedStages.includes("summarize");
	const stages = aggregate
		? "where, summarize, project, order by, limit"
		: "where, order by, limit";
	const example = aggregate
		? "where customer_id == 'cus_123' | summarize failed = countif(status_code >= 400) by request_path | order by failed desc"
		: "where customer_id == 'cus_123' and status_code >= 400 | order by timestamp desc | limit 50";
	return `Supported stages (joined by '|'): ${stages}. Example: ${example}. String values use single quotes. ${QUERYABLE_FIELDS_HINT}`;
};

export const parseLogsQueryOrThrow = ({
	query,
	allowedStages,
}: {
	query: string | undefined;
	allowedStages: RestrictedAplStageKind[];
}): RestrictedAplAst => {
	try {
		return parseRestrictedApl({ query, allowedStages });
	} catch (error) {
		const message =
			error instanceof RestrictedAplStageNotAllowedError
				? `The ${error.stage} stage is only available on the logs.query endpoint — use logs.query for aggregates`
				: error instanceof Error
					? error.message
					: String(error);
		throw new RecaseError({
			message: `Invalid logs query: ${message}. ${logsQuerySyntaxHint({ allowedStages })}`,
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};

const isCustomerIdField = (field: RestrictedAplField) =>
	field.kind === "topLevel" && field.name === "customer_id";

const exprHasCustomerIdFilter = (expr: RestrictedAplExpr): boolean => {
	switch (expr.kind) {
		case "comparison":
		case "stringMatch":
		case "in":
			return isCustomerIdField(expr.field);
		case "and":
		case "or":
			return (
				exprHasCustomerIdFilter(expr.left) ||
				exprHasCustomerIdFilter(expr.right)
			);
	}
};

export const getQueryLogsRangePolicy = (ast: RestrictedAplAst) => {
	const hasCustomerIdFilter = ast.stages.some(
		(stage) => stage.kind === "where" && exprHasCustomerIdFilter(stage.expr),
	);

	return hasCustomerIdFilter
		? {
				defaultRangeMs: QUERY_CUSTOMER_MAX_RANGE_MS,
				maxRangeMs: QUERY_CUSTOMER_MAX_RANGE_MS,
				maxRangeLabel: "30 days",
				maxRangeHint: "Query consecutive windows for longer periods.",
			}
		: {
				defaultRangeMs: QUERY_ORG_MAX_RANGE_MS,
				maxRangeMs: QUERY_ORG_MAX_RANGE_MS,
				maxRangeLabel: "15 days",
				maxRangeHint:
					"Add a customer_id filter to extend the range to 30 days.",
			};
};
