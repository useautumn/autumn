import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";

const realQueryAxiom = { ...(await import("@/external/axiom/queryAxiom.js")) };
const queryAxiom = mock(async () => ({ matches: [] }) as unknown);

mock.module("@/external/axiom/queryAxiom.js", () => ({ queryAxiom }));

afterAll(() => {
	mock.module("@/external/axiom/queryAxiom.js", () => realQueryAxiom);
});

const { queryLogs } = await import(
	"@/internal/logs/actions/queryLogs/queryLogs.js"
);
const { searchRequestLogs } = await import(
	"@/internal/logs/actions/searchRequestLogs/searchRequestLogs.js"
);

const ctx = {
	org: { id: "org_123", slug: "acme" },
	env: AppEnv.Live,
} as Parameters<typeof queryLogs>[0]["ctx"];

const range = {
	startDate: "2026-10-14T00:00:00.000Z",
	endDate: "2026-10-14T12:00:00.000Z",
};

const run = {
	"logs.query": () =>
		queryLogs({ ctx, query: "where status_code >= 400", range, limit: 10 }),
	"logs.search": () =>
		searchRequestLogs({
			ctx,
			query: "where status_code >= 400",
			range,
			limit: 10,
		}),
};

describe("logs Axiom query errors", () => {
	beforeEach(() => queryAxiom.mockReset());

	for (const [endpoint, call] of Object.entries(run)) {
		test(`${endpoint} maps Axiom query validation errors to 400`, async () => {
			queryAxiom.mockImplementation(async () => {
				throw new Error(
					"line: 13, col: 28: grouping by field of type integer|string|boolean|array is not supported",
				);
			});

			const error = await call().catch((error: unknown) => error);

			expect(error).toBeInstanceOf(RecaseError);
			expect(error).toMatchObject({
				code: ErrCode.InvalidInputs,
				statusCode: 400,
			});
			expect((error as Error).message).toContain(
				"grouping by field of type integer|string|boolean|array is not supported",
			);
		});

		test(`${endpoint} leaves other Axiom failures untouched`, async () => {
			const failure = new Error("forbidden");
			queryAxiom.mockImplementation(async () => {
				throw failure;
			});

			expect(await call().catch((error: unknown) => error)).toBe(failure);
		});
	}
});
