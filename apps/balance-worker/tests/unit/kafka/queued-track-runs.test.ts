/**
 * Consecutive queued tracks for one subject are decided as one run. A run is a pure speed-up: the records it
 * commits, their order and offsets, the balances and the bookmark all equal applying every record alone.
 */

import { describe, expect, test } from "bun:test";
import type { CommandRecord } from "@autumn/kafka";
import {
	createCommandPipeline,
	identityOf,
} from "../../fixtures/commandPipeline.js";
import { createState } from "../../fixtures/mutations.js";
import {
	resetOf,
	trackOf,
	updateBalanceOf,
} from "../../fixtures/queuedCommands.js";

const LOW_BALANCE = 40;
const customers = ["cus_1", "cus_2", "low_1", "low_2"];

const seededRandom = (seed: number) => {
	let value = seed;
	return () => {
		value = (value + 0x6d2b79f5) | 0;
		let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
};

/** 800 commands, mostly bursts of one customer's tracks; some resent, some reusing an id, refunds and refusals. */
const randomCommands = ({ seed }: { seed: number }): CommandRecord[] => {
	const random = seededRandom(seed);
	const integer = (min: number, max: number) =>
		min + Math.floor(random() * (max - min + 1));
	const commands: CommandRecord[] = [];
	while (commands.length < 800) {
		const customerId = customers[integer(0, customers.length - 1)] ?? "cus_1";
		for (
			let burst = integer(1, 15);
			burst > 0 && commands.length < 800;
			burst--
		) {
			const index = commands.length;
			const roll = random();
			const earlier = commands[integer(0, Math.max(0, index - 1))];
			if (earlier && roll < 0.05) commands.push(earlier);
			else if (roll < 0.08)
				commands.push(
					updateBalanceOf({ customerId, commandId: `upd_${seed}_${index}` }),
				);
			else if (roll < 0.1)
				commands.push(
					resetOf({ customerId, commandId: `rst_${seed}_${index}` }),
				);
			else
				commands.push(
					trackOf({
						customerId,
						commandId:
							earlier?.type === "track" && roll < 0.13
								? earlier.commandId
								: `trk_${seed}_${index}`,
						value: integer(-2, 9),
					}),
				);
		}
	}
	return commands;
};

const outcomeOf = async ({
	commands,
	decidesQueuedTrackRuns,
}: {
	commands: CommandRecord[];
	decidesQueuedTrackRuns: boolean;
}) => {
	const pipeline = createCommandPipeline({
		decidesQueuedTrackRuns,
		states: ["low_1", "low_2"].map((customerId) =>
			createState({
				identity: identityOf({ customerId }),
				balance: LOW_BALANCE,
			}),
		),
	});
	try {
		for (let start = 0; start < commands.length; start += 50)
			await pipeline.consumeBatch({
				commands: commands.slice(start, start + 50),
				firstOffset: start,
			});
		await pipeline.drain();
		return {
			records: pipeline.commits.flat().map((record) => ({
				id: record.id,
				source: record.source,
				changes: record.changes,
				result: record.result,
			})),
			balances: customers.map(
				(customerId) =>
					pipeline.readState({ customerId })?.customerEntitlements[0]?.balance,
			),
			bookmark: pipeline.readBookmark(),
			parked: pipeline.parked.length,
			// A rejection is logged when its commit settles, so lines interleave by commit timing: compared as a set.
			logs: [...pipeline.logs].sort(),
			decides: pipeline.readDecides(),
		};
	} finally {
		await pipeline.close();
	}
};

describe("queued track runs", () => {
	for (const seed of [1, 2, 3, 4, 5])
		test(`commit exactly what applying each record alone commits (seed ${seed})`, async () => {
			const commands = randomCommands({ seed });
			const alone = await outcomeOf({
				commands,
				decidesQueuedTrackRuns: false,
			});
			const inRuns = await outcomeOf({
				commands,
				decidesQueuedTrackRuns: true,
			});

			const { decides: aloneDecides, ...aloneOutcome } = alone;
			const { decides: runDecides, ...runOutcome } = inRuns;
			expect(runOutcome).toEqual(aloneOutcome);
			expect(alone.bookmark).toBe(800n);
			expect(alone.parked).toBe(0);
			expect(
				alone.records.some(
					(record) =>
						"status" in record.result && record.result.status === "rejected",
				),
			).toBe(true);
			// Fewer partition turns: each run is one.
			expect(runDecides).toBeLessThan(aloneDecides / 2);
		});
});
