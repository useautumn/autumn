import { describe, expect, test } from "bun:test";
import { withDefinedColumns } from "@/internal/balanceWorker/billingPlan/planOps/utils/withDefinedColumns.js";

describe("withDefinedColumns", () => {
	test("updates that set no column are null", () => {
		expect(withDefinedColumns({ updates: {} })).toBeNull();
		expect(
			withDefinedColumns({ updates: { name: undefined, email: undefined } }),
		).toBeNull();
	});

	test("undefined names nothing and is dropped", () => {
		expect(
			withDefinedColumns({ updates: { name: "Ada", email: undefined } }),
		).toEqual({ name: "Ada" });
	});

	test("null, zero, false and the empty string are values, so they are kept", () => {
		expect(
			withDefinedColumns({
				updates: { name: null, balance: 0, canceled: false, email: "" },
			}),
		).toEqual({ name: null, balance: 0, canceled: false, email: "" });
	});
});
