import { expect, test } from "bun:test";
import { formatVersionTransition } from "./versionTransition";

test("pinned source version reads as a transition", () => {
	expect(
		formatVersionTransition({
			planFilter: { plan_id: "pro", version: 2 },
			version: 3,
		}),
	).toBe("v2 → v3");
});

test("several source versions are listed in order", () => {
	expect(
		formatVersionTransition({
			planFilter: { plan_id: "pro", version: { $in: [2, 1] } },
			version: 3,
		}),
	).toBe("v1, v2 → v3");
});

test("no source version shows only the target", () => {
	expect(
		formatVersionTransition({ planFilter: { plan_id: "pro" }, version: 3 }),
	).toBe("→ v3");
});
