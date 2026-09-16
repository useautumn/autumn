/**
 * FullSubject replay hydration may evaluate expiry predicates at one captured
 * historical instant without changing ordinary request-time DB-now behavior.
 *
 * Red (current): the as-of option is ignored and every expiry predicate uses now().
 * Green (after): every expiry predicate binds the supplied instant, while omission
 * keeps now() and malformed instants are rejected before SQL is produced.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { PgDialect } from "drizzle-orm/pg-core";
import { getFullSubjectQuery } from "@/internal/customers/repos/getFullSubject/getFullSubjectQuery.js";

const dialect = new PgDialect();
const EXPIRY_PARAMETER_PATTERN = /expires_at\s*>\s*\$(\d+)/g;
const DB_NOW_EXPIRY_PATTERN =
	/expires_at\s*>\s*EXTRACT\(EPOCH FROM now\(\)\)\s*\*\s*1000/g;

const renderQuery = ({ asOfTimestampMs }: { asOfTimestampMs?: number } = {}) =>
	dialect.sqlToQuery(
		getFullSubjectQuery({
			orgId: "org_as_of",
			env: AppEnv.Sandbox,
			customerId: "customer_as_of",
			aggregateEntityData: true,
			asOfTimestampMs,
		}),
	);

describe("FullSubject as-of expiry clock", () => {
	test.concurrent(
		"binds the captured instant into every expiry predicate",
		() => {
			const asOfTimestampMs = 1_775_000_000_123;
			const query = renderQuery({ asOfTimestampMs });
			const queryAtAnotherInstant = renderQuery({
				asOfTimestampMs: asOfTimestampMs + 1,
			});
			const expiryParameterIndexes = Array.from(
				query.sql.matchAll(EXPIRY_PARAMETER_PATTERN),
				(match) => Number(match[1]) - 1,
			);

			expect(expiryParameterIndexes).toHaveLength(6);
			expect(
				expiryParameterIndexes.map(
					(parameterIndex) => query.params[parameterIndex],
				),
			).toEqual(Array.from({ length: 6 }, () => asOfTimestampMs));
			expect(queryAtAnotherInstant.sql).toBe(query.sql);
			expect(query.sql).not.toContain("now()");
		},
	);

	test.concurrent(
		"keeps database-now semantics when the clock is omitted",
		() => {
			const query = renderQuery();

			expect(query.sql.match(DB_NOW_EXPIRY_PATTERN)).toHaveLength(6);
			expect(query.sql.match(EXPIRY_PARAMETER_PATTERN)).toBeNull();
		},
	);

	test.concurrent("rejects malformed historical instants", () => {
		for (const asOfTimestampMs of [
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.MAX_SAFE_INTEGER + 1,
		]) {
			expect(() => renderQuery({ asOfTimestampMs })).toThrow(
				"asOfTimestampMs must be a non-negative safe integer",
			);
		}
	});
});
