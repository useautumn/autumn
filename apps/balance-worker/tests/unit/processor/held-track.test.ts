import { describe, expect, setSystemTime, test } from "bun:test";
import { BALANCE_WORKER_CATALOG_RECHECK_MS } from "@autumn/env/balanceWorkerConstants";
import {
	MutationBatchAppendError,
	MutationBatchNotCommittedError,
	PartitionWriterRecoveryRequiredError,
} from "../../../src/processor/writer/writerErrors.js";
import type { FailedPosition } from "../../../src/runtime/commitPositions/types/commitPositions.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	decided,
	identity,
	partition,
	residentFixture,
	trackCommand,
	waitForAppend,
} from "../../fixtures/heldTrack.js";

describe("inline tracks with held replies", () => {
	test("an inline track is decided at once, its reply held at its sequence number until the log has it", async () => {
		const f = await residentFixture();
		const committed: number[] = [];
		f.positions.onCommitted(({ seq }) => committed.push(seq));
		try {
			const outcome = decided(
				f.processor.trackInline({
					command: trackCommand({ commandId: "a", value: 3 }),
				}),
			);
			expect(outcome.seq).toBe(2);
			expect(outcome.reply?.result).toMatchObject({ type: "track" });
			expect(JSON.parse(outcome.body)).toEqual(
				JSON.parse(JSON.stringify(outcome.reply)),
			);
			expect(f.positions.readCommitPosition({ partition })).toBe(1);
			await waitForAppend();
			f.appender.release();
			await waitForAppend();
			expect(committed).toEqual([2]);
			expect(f.positions.readCommitPosition({ partition })).toBe(2);
		} finally {
			f.close();
		}
	});

	test("the held reply carries the same bytes the ordinary track answers with", async () => {
		const inline = await residentFixture();
		const classic = await residentFixture();
		try {
			const held = decided(
				inline.processor.trackInline({
					command: trackCommand({ commandId: "same", value: 4 }),
				}),
			);
			const answered = classic.processor.track({
				command: trackCommand({ commandId: "same", value: 4 }),
			});
			await waitForAppend();
			classic.appender.release();
			expect(JSON.parse(held.body)).toEqual(
				JSON.parse(JSON.stringify(await answered)),
			);
		} finally {
			inline.close();
			classic.close();
		}
	});

	test("a retry while the write is in flight gets the same reply and sequence number, and appends nothing", async () => {
		const f = await residentFixture();
		try {
			const first = decided(
				f.processor.trackInline({
					command: trackCommand({ commandId: "r" }),
				}),
			);
			const retry = decided(
				f.processor.trackInline({
					command: trackCommand({ commandId: "r" }),
				}),
			);
			expect(retry).toEqual({
				kind: "decided",
				body: first.body,
				seq: first.seq,
			});
			await waitForAppend();
			f.appender.release();
			await waitForAppend();
			expect(f.appender.batches).toEqual([1, 1]);
			await f.processor.drain();
			const stored = decided(
				f.processor.trackInline({
					command: trackCommand({ commandId: "r" }),
				}),
			);
			expect(stored.seq).toBe(0);
			expect(JSON.parse(stored.body).result).toEqual(
				JSON.parse(first.body).result,
			);
		} finally {
			f.close();
		}
	});

	test("a customer with an ordinary write in flight takes the ordinary path, and an ordinary retry of a held write is answered at its commit", async () => {
		const f = await residentFixture();
		try {
			const ordinary = f.processor.track({
				command: trackCommand({ commandId: "o" }),
			});
			await waitForAppend();
			expect(
				f.processor.trackInline({ command: trackCommand({ commandId: "x" }) }),
			).toEqual({ kind: "refused", reason: "settled_write_in_flight" });
			f.appender.release();
			await ordinary;

			const held = decided(
				f.processor.trackInline({
					command: trackCommand({ commandId: "h" }),
				}),
			);
			const joined = f.processor.track({
				command: trackCommand({ commandId: "h" }),
			});
			await waitForAppend();
			f.appender.release();
			expect(JSON.parse(JSON.stringify(await joined))).toEqual(
				JSON.parse(held.body),
			);
		} finally {
			f.close();
		}
	});

	test("a catalog invalidated past its recheck window is refused inline, and the ordinary path answers from the refreshed rows", async () => {
		let allowance = 1000;
		const synthetic = createSyntheticWorkerDb();
		const catalogCache = createTestCatalogCache({
			db: {
				async getCatalogRows(params) {
					const rows = await synthetic.getCatalogRows(params);
					return {
						...rows,
						entitlements: rows.entitlements.map((row) => ({
							...row,
							allowance,
						})),
					};
				},
			},
		});
		const f = await residentFixture({ catalogCache });
		try {
			allowance = 400;
			catalogCache.invalidate({ orgId: identity.orgId, env: identity.env });
			setSystemTime(Date.now() + BALANCE_WORKER_CATALOG_RECHECK_MS + 1);
			expect(
				f.processor.trackInline({
					command: trackCommand({ commandId: "stale" }),
				}),
			).toEqual({ kind: "refused", reason: "catalog_stale" });
			const answered = f.processor.track({
				command: trackCommand({ commandId: "stale" }),
			});
			await waitForAppend();
			f.appender.release();
			const reply = JSON.parse(JSON.stringify(await answered));
			expect(reply.catalog.entitlements.ent_messages_monthly.allowance).toBe(
				400,
			);
		} finally {
			setSystemTime();
			f.close();
		}
	});

	test("a lock, or a customer whose rows are not resident, is handed to the ordinary path", async () => {
		const f = await residentFixture();
		try {
			expect(
				f.processor.trackInline({
					command: trackCommand({ commandId: "l", lock: true }),
				}),
			).toEqual({ kind: "refused", reason: "lock" });
			expect(
				f.processor.trackInline({
					command: trackCommand({
						commandId: "e",
						who: { ...identity, entityId: "ent_1" },
					}),
				}),
			).toEqual({ kind: "refused", reason: "not_resident" });
			expect(
				f.processor.trackInline({
					command: trackCommand({
						commandId: "c",
						who: { ...identity, customerId: "cus_cold" },
					}),
				}),
			).toEqual({ kind: "refused", reason: "not_resident" });
			expect(f.appender.batches).toEqual([1]);
		} finally {
			f.close();
		}
	});

	test("a drain covers held writes: it settles only once the store has applied them", async () => {
		const f = await residentFixture();
		try {
			const applied = Promise.withResolvers<void>();
			f.store.storeGate = () => applied.promise;
			f.processor.trackInline({ command: trackCommand({ commandId: "s" }) });
			let stored = false;
			const waiting = f.processor.drain().then(() => {
				stored = true;
			});
			await waitForAppend();
			f.appender.release();
			await waitForAppend();
			expect(stored).toBe(false);
			applied.resolve();
			await waiting;
			expect(stored).toBe(true);
		} finally {
			f.close();
		}
	});

	test("a held write whose store apply fails makes the drain fail, as an ordinary write's does", async () => {
		for (const decideWith of ["inline", "ordinary"] as const) {
			const f = await residentFixture();
			try {
				f.store.storeGate = () => Promise.reject(new Error("store refused"));
				const command = trackCommand({ commandId: `apply_${decideWith}` });
				if (decideWith === "inline") f.processor.trackInline({ command });
				else void f.processor.track({ command });
				await waitForAppend();
				f.appender.release();
				await waitForAppend();
				const drained = await f.processor.drain().then(
					() => "resolved",
					(cause: unknown) => cause,
				);
				expect(drained).toBeInstanceOf(PartitionWriterRecoveryRequiredError);
			} finally {
				f.close();
			}
		}
	});

	test("a refused append fails the held write's range as not committed", async () => {
		const f = await residentFixture();
		const failed: FailedPosition[] = [];
		f.positions.onFailedAbove((position) => failed.push(position));
		try {
			f.processor.trackInline({ command: trackCommand({ commandId: "f" }) });
			await waitForAppend();
			f.appender.release({
				fail: new MutationBatchNotCommittedError({ cause: new Error("no") }),
			});
			await waitForAppend();
			expect(failed).toEqual([
				{
					partition,
					seq: 1,
					lastSeq: 2,
					cause: expect.any(MutationBatchAppendError),
				},
			]);
		} finally {
			f.close();
		}
	});
});
