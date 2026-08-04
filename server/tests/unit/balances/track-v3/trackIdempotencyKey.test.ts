import { expect, test } from "bun:test";
import { AppEnv, ms } from "@autumn/shared";
import {
	getTrackQueueIdempotencyKey,
	TRACK_V3_IDEMPOTENCY_TTL_MS,
} from "@/internal/balances/idempotency/trackQueueIdempotency.js";

test("track v3 idempotency keys expire after one day", () => {
	expect(TRACK_V3_IDEMPOTENCY_TTL_MS).toBe(ms.days(1));
});

test("getTrackQueueIdempotencyKey uses the request id", () => {
	expect(
		getTrackQueueIdempotencyKey({
			ctx: {
				id: "req_123",
				env: AppEnv.Sandbox,
				org: { id: "org_123" },
			} as never,
		}),
	).toBe("track:req_123");
});
