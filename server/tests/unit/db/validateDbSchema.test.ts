import { describe, expect, test } from "bun:test";
import { setTimeout } from "node:timers/promises";
import { validateDbSchema } from "@/db/validateDbSchema.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";

describe("validateDbSchema", () => {
	test("limits concurrent table validation queries", async () => {
		let activeQueries = 0;
		let maxActiveQueries = 0;

		const db = {
			select: () => ({
				from: () => ({
					limit: async () => {
						activeQueries++;
						maxActiveQueries = Math.max(maxActiveQueries, activeQueries);
						await setTimeout(1);
						activeQueries--;
					},
				}),
			}),
		} as unknown as DrizzleCli;

		await validateDbSchema({ db, concurrency: 3 });

		expect(maxActiveQueries).toBeLessThanOrEqual(3);
	});
});
