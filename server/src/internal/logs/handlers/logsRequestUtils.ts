import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import type {
	RestrictedAplAst,
	RestrictedAplExpr,
	RestrictedAplField,
} from "../parser/restrictedApl.js";

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

export const resolveLogsRange = ({
	startDate,
	endDate,
	defaultRangeMs = DEFAULT_RANGE_MS,
	maxRangeMs = SEARCH_MAX_RANGE_MS,
	maxRangeLabel = "7 days",
	now = new Date(),
}: {
	startDate?: string;
	endDate?: string;
	defaultRangeMs?: number;
	maxRangeMs?: number;
	maxRangeLabel?: string;
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
			message: `Log range cannot exceed ${maxRangeLabel}`,
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	return {
		startDate: start.toISOString(),
		endDate: end.toISOString(),
	};
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
			}
		: {
				defaultRangeMs: QUERY_ORG_MAX_RANGE_MS,
				maxRangeMs: QUERY_ORG_MAX_RANGE_MS,
				maxRangeLabel: "15 days",
			};
};
