import { expect, test } from "bun:test";
import { swarmChildEnv } from "./swarmChildEnv.ts";

test("keeps a 5% idle buffer in the tail instead of scripts/tw's 30%", () => {
	expect(swarmChildEnv({ env: {} })).toEqual({
		TW_MODAL_NO_STALE: "1",
		TW_CULL_BUFFER_FRACTION: "0.05",
	});
});

test("an operator's TW_CULL_BUFFER_FRACTION still wins", () => {
	expect(
		swarmChildEnv({ env: { TW_CULL_BUFFER_FRACTION: "0.3" } })
			.TW_CULL_BUFFER_FRACTION,
	).toBe("0.3");
});
