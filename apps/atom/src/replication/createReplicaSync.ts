import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";

/** Marks a row a replica sends again after a restart, apart from the push it first relayed. */
export const RESEND_HEADER = "x-atom-resend";

import { storedSubjectToPushBody } from "../lib/contracts/subjectContract.js";
import { SUBJECT_PUSH } from "../pushes/applyPushes.js";
import type { Slots } from "../slots/types/slots.js";
import {
	type CatchUpContext,
	catchUpBeforeServing,
	catchUpFromEveryPeer,
	SETTLE_CATCH_UPS_MS,
} from "./catchUp/catchUpFromPeers.js";
import { HOLD_MS } from "./outbox/createPeerOutbox.js";
import type { Replication } from "./types/replication.js";

/** Past the relay hold: what a peer gave up delivering here is at most this old when this replica asks again. */
const CATCH_UP_MARGIN_MS = 60_000;
/** How often, once serving, a replica asks every peer for what they wrote lately; what one of them alone holds lands within this. */
export const ANTI_ENTROPY_EVERY_MS = 2 * 60_000;
/** Reaches back past the hold and one period, so a copy dropped after the hold is found by the next pass. */
export const ANTI_ENTROPY_WINDOW_MS =
	HOLD_MS + ANTI_ENTROPY_EVERY_MS + CATCH_UP_MARGIN_MS;
/** Rows this replica wrote shortly before it last stopped, sent again on boot in case their relay died with it. */
const RESEND_WINDOW_MS = HOLD_MS + CATCH_UP_MARGIN_MS;
const RESEND_LIMIT = 10_000;

export type ReplicaSyncContext = CatchUpContext & {
	replication: Replication;
	now: () => number;
	isStopping: () => boolean;
};

/**
 * Keeps one thread's slots in step with the other replicas across a restart. Built before the thread listens, so the
 * point it fell behind at is fixed before any live relay lands and moves the files' newest write.
 */
export const createReplicaSync = ({
	ctx,
	slots,
}: {
	ctx: ReplicaSyncContext;
	slots: Slots;
}) => {
	const sleep = ctx.sleep ?? Bun.sleep;
	const lastAppliedAt = slots.maxAppliedAt();
	const openedAt = ctx.now();
	/** Everything, on a fresh volume; else what the peer wrote while this replica was away, and a margin past the relay hold. */
	const bootWindow =
		lastAppliedAt === 0
			? null
			: openedAt - lastAppliedAt + HOLD_MS + CATCH_UP_MARGIN_MS;

	/** Before serving: from the first ready peer. */
	const catchUp = () =>
		catchUpBeforeServing({ ctx, slots, window: bootWindow });

	/** What this thread wrote just before it last stopped goes to the peers again: its relay may have died with the process. */
	function resendRecent(): number {
		if (lastAppliedAt === 0) return 0;
		const recent = slots.listOwnAppliedAfter({
			after: lastAppliedAt - RESEND_WINDOW_MS,
			limit: RESEND_LIMIT,
		});
		for (const { subject } of recent) {
			const customerId = subject.state.identity.customerId;
			ctx.replication.replicate({
				kind: SUBJECT_PUSH.kind,
				key: customerId,
				body: storedSubjectToPushBody({ subject }),
				headers: {
					[ATOM_CUSTOMER_ID_HEADER]: customerId,
					[RESEND_HEADER]: "1",
				},
			});
		}
		return recent.length;
	}

	/** One pass over every ready peer for what they wrote lately. */
	const pass = () =>
		catchUpFromEveryPeer({ ctx, slots, window: ANTI_ENTROPY_WINDOW_MS });

	/** Once serving: a few passes while peers learn this address, then one every period for as long as the thread runs. */
	async function runPasses(): Promise<void> {
		const delays = [...SETTLE_CATCH_UPS_MS];
		for (;;) {
			await sleep(delays.shift() ?? ANTI_ENTROPY_EVERY_MS);
			if (ctx.isStopping()) return;
			await pass();
		}
	}

	return { catchUp, resendRecent, pass, runPasses };
};
