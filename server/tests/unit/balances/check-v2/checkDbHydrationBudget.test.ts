import { describe, expect, test } from "bun:test";
import { isTransientDbError } from "@/db/dbUtils.js";
import {
	CHECK_DB_HYDRATION_BUDGET_MS,
	withCheckDbHydrationBudget,
} from "@/internal/balances/check/getCheckDataV2.js";

describe("check DB hydration budget", () => {
	test("returns hydration that resolves within budget", async () => {
		const result = await withCheckDbHydrationBudget(async () => "hydrated");

		expect(result).toBe("hydrated");
	});

	test("classifies budget expiry as transient", async () => {
		const startedAt = Date.now();
		const error = await withCheckDbHydrationBudget(
			() => new Promise<never>(() => {}),
		).catch((caught) => caught);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("Query read timeout");
		expect(isTransientDbError({ error })).toBe(true);
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
			CHECK_DB_HYDRATION_BUDGET_MS - 100,
		);
	});
});
