import { expect, test } from "bun:test";
import { getTrackIdempotencyKey } from "@/internal/balances/track/v3/trackIdempotencyKey.js";

test("getTrackIdempotencyKey falls back to request id for empty idempotency keys", () => {
  expect(
    getTrackIdempotencyKey({
      idempotencyKey: "",
      requestId: "req_123",
    }),
  ).toBe("track:req_123");
});
