import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { getTrackIdempotencyKey } from "@/internal/balances/track/v3/trackIdempotencyKey.js";

test("getTrackIdempotencyKey uses the request id", () => {
	expect(
		getTrackIdempotencyKey({
			ctx: {
				id: "req_123",
				env: AppEnv.Sandbox,
				org: { id: "org_123" },
			} as never,
		}),
	).toBe("track:req_123");
});
