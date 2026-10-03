/**
 * Queued commands in one consumed batch share Kafka commits: each is decided in arrival order through
 * the partition writer, and its commit settles with the batch before the batch's offset commits.
 *
 * Red (before): every queued command waited for its own commit, so N commands cost N commits.
 * Green (after): commits are shared, offsets and the bookmark still move forward in order, a refused
 * commit parks the partition without the bookmark passing it, and decides run at most
 * BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT ahead of their commits.
 */

import { describe, expect, test } from "bun:test";
import { BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT } from "@autumn/env/balanceWorkerConstants";
import type { CommandRecord } from "@autumn/kafka";
import {
	type CommandPipeline,
	createCommandPipeline,
	customers,
	STARTING_BALANCE,
} from "../../fixtures/commandPipeline.js";
import {
	resetOf,
	trackOf,
	updateBalanceOf,
} from "../../fixtures/queuedCommands.js";

const customerOf = ({ index }: { index: number }) =>
	customers[index % customers.length] ?? "cus_1";

const queuedTracks = ({ count }: { count: number }) =>
	Array.from({ length: count }, (_, index) =>
		trackOf({ customerId: customerOf({ index }), commandId: `track_${index}` }),
	);

const offsetsOf = ({ commands }: { commands: CommandRecord[] }) =>
	commands.map((_, offset) => offset);

const balanceOf = ({
	pipeline,
	customerId,
}: {
	pipeline: CommandPipeline;
	customerId: string;
}) =>
	pipeline.readState({ customerId })?.customerEntitlements[0]?.balance ?? null;

const isNonDecreasing = (values: readonly bigint[]) =>
	values.every(
		(value, index) => index === 0 || value >= (values[index - 1] ?? value),
	);

describe("queued commit batching", () => {
	test("queued tracks in one fetched batch share Kafka commits, and offsets and the bookmark move forward in order", async () => {
		const pipeline = createCommandPipeline();
		try {
			const commands = queuedTracks({ count: 30 });
			await pipeline.consumeBatch({ commands });
			await pipeline.drain();

			expect(pipeline.commits.flat()).toHaveLength(30);
			expect(pipeline.commits.length).toBeLessThan(30);
			expect(pipeline.committedSources()).toEqual(offsetsOf({ commands }));
			expect(isNonDecreasing(pipeline.bookmarks)).toBe(true);
			expect(pipeline.readBookmark()).toBe(30n);
			expect(
				customers.map((customerId) => balanceOf({ pipeline, customerId })),
			).toEqual(customers.map(() => STARTING_BALANCE - 10));
		} finally {
			await pipeline.close();
		}
	});

	test("resets and balance updates share commits too; a reset with nothing due still moves the bookmark, in order", async () => {
		const pipeline = createCommandPipeline();
		try {
			const builders = [trackOf, resetOf, updateBalanceOf];
			const commands: CommandRecord[] = Array.from({ length: 30 }, (_, index) =>
				(builders[index % builders.length] ?? trackOf)({
					customerId: customerOf({ index }),
					commandId: `command_${index}`,
				}),
			);
			await pipeline.consumeBatch({ commands });
			await pipeline.drain();

			const writes = commands.flatMap((command, offset) =>
				command.type === "reset" ? [] : [offset],
			);
			expect(pipeline.committedSources()).toEqual(writes);
			expect(pipeline.commits.length).toBeLessThan(writes.length);
			expect(isNonDecreasing(pipeline.bookmarks)).toBe(true);
			expect(pipeline.readBookmark()).toBe(30n);
		} finally {
			await pipeline.close();
		}
	});

	test("a commit the broker refused parks the partition, and nothing decided after it commits or moves the bookmark past it", async () => {
		const pipeline = createCommandPipeline({ failAppendAt: 1 });
		try {
			await pipeline.consumeBatch({ commands: queuedTracks({ count: 30 }) });
			await pipeline.drain().catch(() => undefined);

			expect(pipeline.parked).toHaveLength(1);
			const committed = pipeline.committedSources();
			expect(committed).toEqual(committed.map((_, offset) => offset));
			expect(pipeline.readBookmark() ?? 0n).toBeLessThanOrEqual(
				BigInt(committed.length),
			);
		} finally {
			await pipeline.close();
		}
	});

	test("decides stop running ahead of a stalled commit at the in-flight bound, and resume once it lands", async () => {
		const held = Promise.withResolvers<void>();
		const pipeline = createCommandPipeline({
			heldAppend: { at: 0, until: held.promise },
		});
		try {
			const commands = queuedTracks({
				count: BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT + 50,
			});
			const consumed = pipeline.consumeBatch({ commands });
			for (let polls = 0; polls < 200; polls++) {
				if (pipeline.readDecides() >= BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT)
					break;
				await Bun.sleep(5);
			}
			await Bun.sleep(50);

			expect(pipeline.commits).toEqual([]);
			expect(pipeline.readDecides()).toBe(
				BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT,
			);

			held.resolve();
			await consumed;
			expect(pipeline.committedSources()).toEqual(offsetsOf({ commands }));
		} finally {
			held.resolve();
			await pipeline.close();
		}
	});

	test("sync and queued tracks for the same customer decide in the order they arrive", async () => {
		const pipeline = createCommandPipeline();
		try {
			const queued = Array.from({ length: 10 }, (_, index) =>
				trackOf({ customerId: "cus_1", commandId: `queued_${index}` }),
			);
			const arrivals: string[] = [];
			const syncReplies: Promise<unknown>[] = [];
			await pipeline.consumeBatch({
				commands: queued,
				beforeEach: ({ index }) => {
					if (index > 0) {
						const commandId = `sync_${index}`;
						arrivals.push(commandId);
						syncReplies.push(
							pipeline.processor.track({
								command: trackOf({ customerId: "cus_1", commandId }),
							}),
						);
					}
					arrivals.push(`queued_${index}`);
				},
			});
			await Promise.all(syncReplies);
			await pipeline.drain();

			expect(pipeline.commits.flat().map((record) => record.id)).toEqual(
				arrivals,
			);
			expect(balanceOf({ pipeline, customerId: "cus_1" })).toBe(
				STARTING_BALANCE - arrivals.length,
			);
		} finally {
			await pipeline.close();
		}
	});
});
