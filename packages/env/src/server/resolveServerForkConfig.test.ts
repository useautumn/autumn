import { expect, test } from "bun:test";
import { resolveServerForkConfig } from "./resolveServerForkConfig.js";

test("fork count preserves the environment, cap and default with provenance", () => {
	for (const value of [undefined, "", "0", "-1", "1.5", "bad"])
		expect(resolveServerForkConfig({ value })).toEqual({
			forkCount: 4,
			forkCountSource: "default",
		});
	for (const value of ["1", "4", "6"])
		expect(resolveServerForkConfig({ value })).toEqual({
			forkCount: Number(value),
			forkCountSource: "environment",
		});
	expect(resolveServerForkConfig({ value: "9" })).toEqual({
		forkCount: 6,
		forkCountSource: "environment",
	});
});
