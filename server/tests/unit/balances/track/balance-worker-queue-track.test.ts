import { toBatchTrackEntries } from "@/internal/balances/track/batchTrackEntries.js";
import { describe, expect, spyOn, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { ErrCode, type TrackParams } from "@autumn/shared";
import { runBalanceWorkerAsyncTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerAsyncTrack.js";
import { runBalanceWorkerBatchTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerBatchTrack.js";
import * as claimKey from "@/internal/misc/idempotency/actions/checkIdempotencyKey.js";
import * as releaseKey from "@/internal/misc/idempotency/actions/releaseIdempotencyKey.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";

function fixture({ failure }: { failure?: Error } = {}) {
	const { ctx, fullSubject } = createCustomerFixture();
	const queued: TrackCommand[][] = [];
	const client = {
		queue: {
			track: async ({ commands }: { commands: TrackCommand[] }) => {
				if (failure) throw failure;
				queued.push(commands);
			},
			reset: async () => undefined,
			updateBalance: async () => undefined,
			evict: async () => undefined,
		},
	};
	const body: TrackParams = {
		customer_id: fullSubject.customerId,
		feature_id: "messages",
		value: 3,
	};
	return { ctx, client, queued, body };
}

function spyOnClaims() {
	const claims: string[] = [];
	const releases: string[] = [];
	const claimSpy = spyOn(claimKey, "checkIdempotencyKey").mockImplementation(
		async ({ idempotencyKey }) => {
			claims.push(idempotencyKey);
		},
	);
	const releaseSpy = spyOn(
		releaseKey,
		"releaseIdempotencyKey",
	).mockImplementation(async ({ idempotencyKey }) => {
		releases.push(idempotencyKey);
	});
	const restore = () => {
		claimSpy.mockRestore();
		releaseSpy.mockRestore();
	};
	return { claims, releases, restore };
}

const unavailable = new BalanceWorkerClientError({
	code: "COMMAND_LOG_UNAVAILABLE",
	outcome: "not_submitted",
	message: "kafka away",
});

describe("runBalanceWorkerAsyncTrack", () => {
	test("the API claims the body key, queues the commands, and keeps the claim", async () => {
		const spies = spyOnClaims();
		try {
			const { ctx, client, queued, body } = fixture();
			await runBalanceWorkerAsyncTrack({
				ctx,
				body: { ...body, idempotency_key: "k1" },
				client,
			});
			expect(spies.claims).toEqual(["track:k1"]);
			expect(spies.releases).toEqual([]);
			expect(queued).toHaveLength(1);
			expect(queued[0]?.map((command) => command.featureId)).toEqual([
				"messages",
			]);
			expect(queued[0]?.[0]?.idempotency).toBeUndefined();
		} finally {
			spies.restore();
		}
	});

	test("a failed append is a 503 and releases the claim", async () => {
		const spies = spyOnClaims();
		try {
			const { ctx, client, body } = fixture({ failure: unavailable });
			await expect(
				runBalanceWorkerAsyncTrack({
					ctx,
					body: { ...body, idempotency_key: "k1" },
					client,
				}),
			).rejects.toMatchObject({ statusCode: 503 });
			expect(spies.releases).toEqual(["track:k1"]);
		} finally {
			spies.restore();
		}
	});
});

describe("runBalanceWorkerBatchTrack", () => {
	test("every item is queued in one append; the API claims nothing and each keyed item carries its key", async () => {
		const spies = spyOnClaims();
		try {
			const { ctx, client, queued, body } = fixture();
			await runBalanceWorkerBatchTrack({
				ctx,
				entries: toBatchTrackEntries({ body: [{ ...body, idempotency_key: "a" }, body] }),
				client,
			});
			expect(spies.claims).toEqual([]);
			expect(queued).toHaveLength(1);
			const [keyed, plain] = queued[0] ?? [];
			expect(keyed?.idempotency).toEqual({
				key: "track:a",
				ttlMs: expect.any(Number),
			});
			expect(keyed?.requestId).toBe(`${ctx.id}-0`);
			expect(plain?.idempotency).toBeUndefined();
			expect(plain?.requestId).toBe(`${ctx.id}-1`);
		} finally {
			spies.restore();
		}
	});

	test("a malformed item fails the whole batch before anything is queued", async () => {
		const { ctx, client, queued, body } = fixture();
		await expect(
			runBalanceWorkerBatchTrack({
				ctx,
				entries: toBatchTrackEntries({ body: [body, { ...body, feature_id: "missing" }] }),
				client,
			}),
		).rejects.toMatchObject({ code: ErrCode.FeatureNotFound });
		expect(queued).toEqual([]);
	});

	test("a failed append is a 503", async () => {
		const { ctx, client, body } = fixture({ failure: unavailable });
		await expect(
			runBalanceWorkerBatchTrack({ ctx, entries: toBatchTrackEntries({ body: [body] }), client }),
		).rejects.toMatchObject({ statusCode: 503 });
	});
});
