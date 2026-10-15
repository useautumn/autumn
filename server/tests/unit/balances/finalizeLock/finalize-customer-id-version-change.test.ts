import { describe, expect, test } from "bun:test";
import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	applyRequestVersionChanges,
	FinalizeLockParamsV0Schema,
	type FinalizeLockParamsV1,
	FinalizeLockParamsV1Schema,
	LATEST_VERSION,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const lockOnly = { lock_id: "lock_1", action: "confirm" } as const;

describe("V2_5_FinalizeLockParamsChange", () => {
	test("from 2.6 a finalize must name its lock's customer", () => {
		expect(
			FinalizeLockParamsV1Schema.parse({ ...lockOnly, customer_id: "cus_1" }),
		).toEqual({ ...lockOnly, customer_id: "cus_1" });
		for (const unnamed of [lockOnly, { ...lockOnly, customer_id: "" }])
			expect(FinalizeLockParamsV1Schema.safeParse(unnamed).success).toBe(false);
	});

	test("before 2.6 a finalize names only its lock, and reaches the handler naming no customer", () => {
		expect(
			FinalizeLockParamsV0Schema.parse({ ...lockOnly, customer_id: "cus_1" }),
		).toEqual(lockOnly);
		for (const fromVersion of [ApiVersion.V2_5, ApiVersion.V2_1])
			expect(
				applyRequestVersionChanges<FinalizeLockParamsV1>({
					input: lockOnly as unknown as FinalizeLockParamsV1,
					fromVersion: new ApiVersionClass(fromVersion),
					toVersion: new ApiVersionClass(LATEST_VERSION),
					resource: AffectedResource.FinalizeLock,
					ctx: { features: [] } as unknown as AutumnContext,
				}),
			).toEqual({ ...lockOnly, customer_id: "" });
	});
});
