/**
 * An Atom resends journal entries Autumn already accepted (after its replica restarts, or a lost reply). The seq on the
 * customer row moves in the same mutation as the deduction, so a held seq means "already applied", whatever the
 * idempotency store or the writer's recent-commands window still remember.
 */

import { describe, expect, test } from "bun:test";
import { parseTrackCommand, type TrackCommand } from "@autumn/balance-engine";
import {
	createCommandPipeline,
	STARTING_BALANCE,
} from "../../fixtures/commandPipeline.js";
import { trackOf } from "../../fixtures/queuedCommands.js";

const customerId = "cus_1";
const writerId = "w_1";

/** Journal entry `seq` as the Atom hands it in, stamped with its source; `sent` varies only its command and request ids. */
const handedIn = ({
	seq,
	value = 10,
	sent = "",
}: {
	seq: number;
	value?: number;
	sent?: string;
}) =>
	parseTrackCommand({
		input: {
			...trackOf({ customerId, commandId: `atom_req_${seq}${sent}`, value }),
			requestId: `atom_req_${seq}${sent}`,
			overageBehavior: "overflow",
			idempotency: { key: `track:atom_req_${seq}${sent}`, ttlMs: 86_400_000 },
			source: { atomId: "atom_1", writerId, seq },
		},
	}) satisfies TrackCommand;

const readCustomer = ({
	pipeline,
}: {
	pipeline: ReturnType<typeof createCommandPipeline>;
}) => {
	const state = pipeline.readState({ customerId });
	return {
		balance: state?.customerEntitlements[0]?.balance,
		atomSeqs: state?.customer.atom_seqs,
	};
};

describe("an Atom's resent journal entries", () => {
	// A postgres-backed worker keeps no receipts and forgets command ids past its window; its claims are a store that
	// fails open. Sent under ids nothing remembers, a resend reaches the decide exactly as it did on staging.
	test("a batch resent where no claim, receipt or recent command remembers it deducts once, and the seq stays landed", async () => {
		const pipeline = createCommandPipeline();
		try {
			await pipeline.consumeBatch({
				commands: [handedIn({ seq: 1 }), handedIn({ seq: 2 })],
			});
			await pipeline.drain();
			pipeline.restart();
			await pipeline.consumeBatch({
				commands: [
					handedIn({ seq: 1, sent: "_again" }),
					handedIn({ seq: 2, sent: "_again" }),
				],
				firstOffset: 2,
			});
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toEqual({
				balance: STARTING_BALANCE - 20,
				atomSeqs: { atom_1: { [writerId]: 2 } },
			});
		} finally {
			await pipeline.close();
		}
	});

	test("an entry redelivered because its first commit never landed still deducts, once", async () => {
		const pipeline = createCommandPipeline({ failAppendAt: 0 });
		try {
			await pipeline.consumeBatch({ commands: [handedIn({ seq: 1 })] });
			await pipeline.drain().catch(() => undefined);
			pipeline.restart();
			await pipeline.consumeBatch({ commands: [handedIn({ seq: 1 })] });
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toEqual({
				balance: STARTING_BALANCE - 10,
				atomSeqs: { atom_1: { [writerId]: 1 } },
			});
		} finally {
			await pipeline.close();
		}
	});

	test("a seq past a gap in the journal still deducts", async () => {
		const pipeline = createCommandPipeline();
		try {
			await pipeline.consumeBatch({
				commands: [handedIn({ seq: 1 }), handedIn({ seq: 5 })],
			});
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toEqual({
				balance: STARTING_BALANCE - 20,
				atomSeqs: { atom_1: { [writerId]: 5 } },
			});
		} finally {
			await pipeline.close();
		}
	});
});
