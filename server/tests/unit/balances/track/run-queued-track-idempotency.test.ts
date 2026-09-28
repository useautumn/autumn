/**
 * Worker-side body idempotency for queued tracks.
 *
 * Contract under test:
 *   - Default (async/batch messages): the worker claims `track:${key}` before
 *     running — its only body-key dedup for messages with no accept-time claim.
 *   - validateTrackBodyIdempotencyKey: false (single-lane messages, which
 *     claimed at accept time): the worker runs WITHOUT claiming.
 *   - A duplicate claim is swallowed (message acked, no deduction, no rethrow).
 *   - Messages without a body idempotency_key never touch the claim.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv, ErrCode, RecaseError, type TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

// Mocks are stateless so tests can run concurrently: behavior is driven by
// the key itself (keys containing "-dup" claim as duplicates), and calls are
// asserted by filtering on each test's unique ids.
const claimCalls: Array<{ idempotencyKey: string }> = [];
const releaseCalls: Array<{ idempotencyKey: string }> = [];
const runTrackV3Calls: Array<{ body: TrackParams }> = [];

await mockModuleWithRestore(
	"@/internal/misc/idempotency/actions/checkIdempotencyKey.js",
	() => ({
		checkIdempotencyKey: async (args: { idempotencyKey: string }) => {
			claimCalls.push(args);
			if (args.idempotencyKey.includes("-dup")) {
				throw new RecaseError({
					message: "duplicate",
					code: ErrCode.DuplicateIdempotencyKey,
					statusCode: 409,
				});
			}
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/misc/idempotency/actions/releaseIdempotencyKey.js",
	() => ({
		releaseIdempotencyKey: async (args: { idempotencyKey: string }) => {
			releaseCalls.push(args);
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/track/v3/runTrackV3.js",
	() => ({
		runTrackV3: async (args: { body: TrackParams }) => {
			runTrackV3Calls.push(args);
			return { ok: true };
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/balances/track/utils/getFeatureDeductions.js",
	() => ({
		getTrackFeatureDeductionsForBody: () => [],
	}),
);

import { runQueuedTrack } from "@/internal/balances/track/runQueuedTrack.js";

import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const makeCtx = () =>
	({
		org: { id: "org_123" },
		env: AppEnv.Sandbox,
		logger: {
			info: () => undefined,
			// warn included: the idempotency path hands this logger to fire-and-forget
			// Dynamo-mirror work that logs failures after the test completes.
			warn: () => undefined,
		},
	}) as unknown as AutumnContext;

const makeBody = ({
	customerId,
	idempotencyKey,
}: {
	customerId: string;
	idempotencyKey?: string;
}): TrackParams => ({
	customer_id: customerId,
	feature_id: "messages",
	value: 1,
	idempotency_key: idempotencyKey,
});

const deductionsFor = (customerId: string) =>
	runTrackV3Calls.filter(({ body }) => body.customer_id === customerId);

const claimsFor = (idempotencyKey: string) =>
	claimCalls.filter(
		(call) => call.idempotencyKey === `track:${idempotencyKey}`,
	);

describe("runQueuedTrack body idempotency", () => {
	test.concurrent(
		"claims the body key by default (async/batch messages)",
		async () => {
			const body = makeBody({
				customerId: "cus_queued_claim",
				idempotencyKey: "queued-claim-1",
			});

			await runQueuedTrack({ ctx: makeCtx(), body });

			expect(claimsFor("queued-claim-1")).toHaveLength(1);
			expect(deductionsFor("cus_queued_claim")).toHaveLength(1);
			expect(releaseCalls).toHaveLength(0);
		},
	);

	test.concurrent(
		"skips the claim for single-lane messages (flag false)",
		async () => {
			const body = makeBody({
				customerId: "cus_queued_skip",
				idempotencyKey: "queued-skip-1",
			});

			await runQueuedTrack({
				ctx: makeCtx(),
				body,
				validateTrackBodyIdempotencyKey: false,
			});

			expect(claimsFor("queued-skip-1")).toHaveLength(0);
			expect(deductionsFor("cus_queued_skip")).toHaveLength(1);
		},
	);

	test.concurrent(
		"swallows a duplicate claim without running the deduction",
		async () => {
			const body = makeBody({
				customerId: "cus_queued_dup",
				idempotencyKey: "queued-dup-1",
			});

			await expect(
				runQueuedTrack({ ctx: makeCtx(), body }),
			).resolves.toBeUndefined();

			expect(claimsFor("queued-dup-1")).toHaveLength(1);
			expect(deductionsFor("cus_queued_dup")).toHaveLength(0);
			expect(releaseCalls).toHaveLength(0);
		},
	);

	test.concurrent(
		"never touches the claim when the body has no idempotency key",
		async () => {
			const body = makeBody({ customerId: "cus_queued_nokey" });

			await runQueuedTrack({ ctx: makeCtx(), body });

			expect(deductionsFor("cus_queued_nokey")).toHaveLength(1);
			expect(
				claimCalls.filter((call) => call.idempotencyKey.includes("undefined")),
			).toHaveLength(0);
		},
	);
});
