import { describe, expect, test } from "bun:test";
import { publicUrlAfterFailedAccess } from "./cloudflare.ts";

describe("publicUrlAfterFailedAccess", () => {
	test("does not advertise a hostname that never came up", () => {
		expect(
			publicUrlAfterFailedAccess({
				previousPublicUrl: undefined,
				previousStillServes: false,
			}),
		).toBeUndefined();
		expect(
			publicUrlAfterFailedAccess({
				previousPublicUrl: "https://autumn-wt1-dead.autumnworktree.com",
				previousStillServes: false,
			}),
		).toBeUndefined();
	});

	test("keeps the previous origin when that tunnel is still serving", () => {
		expect(
			publicUrlAfterFailedAccess({
				previousPublicUrl: "https://autumn-wt1-aa11bb.autumnworktree.com/",
				previousStillServes: true,
			}),
		).toBe("https://autumn-wt1-aa11bb.autumnworktree.com");
	});
});
