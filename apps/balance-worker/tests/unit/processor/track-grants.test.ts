/**
 * Track grants: an owner escrows K = min(H/(s·F), 100) units to a server lane after its sync track, never more than H/s
 * in all, and reserves what is unspent against every other decision; tracks answered inside a grant reach the ledger
 * through the command queue and are applied there in full.
 */

import { describe, expect, test } from "bun:test";
import {
	type CheckCommand,
	decideGrantedTrack,
	parseCheckCommand,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import {
	createBalanceWorkerClient,
	type HttpRequest,
	type HttpResponse,
} from "@autumn/balance-worker-client";
import {
	type CheckReply,
	type TrackReply,
	WORKER_TRACK_GRANT_LANE_HEADER,
} from "@autumn/balance-worker-client/protocol";
import { createTrackGrants } from "../../../../../packages/balance-worker-client/src/trackGrants/createTrackGrants.js";
import {
	TRACK_GRANT_HOLD_MS,
	TRACK_GRANT_TTL_MS,
} from "../../../src/processor/subject/subjectDecisions/createTrackGrants.js";
import type { PartitionProcessorConfig } from "../../../src/processor/types/partitionProcessor.js";
import type { CommittedMutation } from "../../../src/processor/writer/types/mutation.js";
import {
	createState,
	createTrackCommand,
	testOrg,
} from "../../fixtures/mutations.js";
import {
	createResidentProcessor,
	residentIdentityOf,
} from "../../fixtures/residentProcessor.js";

const T0 = 1_700_000_000_000;
/** An owner past the window in which a predecessor's grants could still be outstanding. */
const WARM = T0 - TRACK_GRANT_TTL_MS - TRACK_GRANT_HOLD_MS - 1;
const identity = residentIdentityOf({ customerId: "cus_1" });

type Processor = Awaited<ReturnType<typeof createResidentProcessor>>;

const processorWith = async ({
	balance = 1_000,
	config = { grantsTracks: true },
	warm = true,
}: {
	balance?: number;
	config?: Partial<PartitionProcessorConfig>;
	warm?: boolean;
} = {}): Promise<Processor> => {
	const processor = await createResidentProcessor({
		states: [createState({ identity, balance }) as SubjectState],
		config,
	});
	// Any track starts the owner's clock; one with no lane takes nothing and is granted nothing.
	if (warm) await processor.track({ command: trackOf({ at: WARM, value: 0 }) });
	return processor;
};

let commandIds = 0;
const trackOf = ({
	at = T0,
	value = 1,
	overageBehavior = "reject",
}: {
	at?: number;
	value?: number;
	overageBehavior?: TrackCommand["overageBehavior"];
} = {}): TrackCommand =>
	createTrackCommand({
		identity,
		commandId: `t${++commandIds}`,
		value,
		occurredAt: at,
		overageBehavior,
	});

const checkOf = ({ at }: { at: number }): CheckCommand =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org: testOrg,
			requestId: `req_check_${at}_${++commandIds}`,
			identity,
			featureId: "messages",
			internalFeatureId: "feat_messages",
			requiredBalance: 1,
			properties: null,
			occurredAt: at,
		},
	});

const balanceOf = (reply: TrackReply | CheckReply) =>
	reply.state.customerEntitlements.reduce((sum, row) => sum + row.balance, 0);

const ownerBalance = async ({
	processor,
	at,
}: {
	processor: Processor;
	at: number;
}) => balanceOf(await processor.check({ command: checkOf({ at }) }));

const applyQueued = async ({
	processor,
	command,
}: {
	processor: Processor;
	command: TrackCommand;
}): Promise<CommittedMutation> => {
	const decided = await processor.decideTrack({ command });
	return (await decided.waitForCommit()) as CommittedMutation;
};

/** A seeded PRNG, so a failing seed replays exactly. */
const randomOf = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
};

describe("track grants on the owner", () => {
	test("off by default: a lane gets no grant and the reply is byte-identical", async () => {
		const off = await processorWith({ config: {} });
		const on = await processorWith();
		const command = trackOf({ value: 3 });
		const offReply = await off.track({ command, grantLane: "lane_a" });
		const onWithoutLane = await on.track({ command });
		expect(offReply.grant).toBeUndefined();
		expect(JSON.stringify(onWithoutLane)).toBe(JSON.stringify(offReply));
		expect(off.readCounters()).toMatchObject({
			trackGrantsIssued: 0,
			trackGrantsWithheld: 0,
		});
	});

	test("K = min(H/(s·F), 100), and every grant together stays within H/s", async () => {
		const processor = await processorWith({ balance: 1_000 });
		const a = await processor.track({
			command: trackOf({ value: 1 }),
			grantLane: "lane_a",
		});
		// H = 999 after the track, one lane: min(⌊999/4⌋, 100).
		expect(a.grant).toEqual({
			leaseId: expect.any(String),
			units: 100,
			expiresAt: T0 + TRACK_GRANT_TTL_MS,
		});

		const small = await processorWith({ balance: 201 });
		const lanes = ["a", "b", "c", "d"];
		const units: number[] = [];
		for (const lane of lanes) {
			const reply = await small.track({
				command: trackOf({ value: 1, at: T0 + 1 }),
				grantLane: lane,
			});
			units.push(reply.grant?.units ?? 0);
		}
		// F grows with each lane seen this second; the H/s cap leaves the last lane nothing.
		// H: 200 → ⌊200/4⌋=50; 199, F=2 → ⌊199/8⌋=24; 198, F=3 → 16 but ⌊198/4⌋−74 = −25 → none.
		expect(units).toEqual([50, 0, 0, 0]);
		expect(units.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(
			Math.floor(200 / 4),
		);
	});

	test("granted units are reserved: a sync track can't take them, the granted track releases them", async () => {
		const processor = await processorWith({ balance: 101 });
		const granted = await processor.track({
			command: trackOf({ value: 1 }),
			grantLane: "lane_a",
		});
		// H = 100 → K = 25 reserved; 75 left for everyone else.
		expect(granted.grant?.units).toBe(25);
		const tooMuch = await processor.track({
			command: trackOf({ value: 76, at: T0 + 1 }),
		});
		expect(tooMuch.result.status).toBe("rejected");
		const leased = await applyQueued({
			processor,
			command: {
				...trackOf({ value: 10, at: T0 + 2, overageBehavior: "overflow" }),
				leaseId: granted.grant?.leaseId,
			},
		});
		expect(leased.mutation.result).toMatchObject({ status: "applied" });
		// 15 of the grant are still reserved: 90 real, 75 free.
		const fits = await processor.track({
			command: trackOf({ value: 75, at: T0 + 3 }),
		});
		expect(fits.result.status).toBe("applied");
		expect(await ownerBalance({ processor, at: T0 + 4 })).toBe(15);
		expect(processor.readCounters()).toMatchObject({
			trackGrantsIssued: 1,
			trackGrantedApplied: 1,
			trackGrantedLate: 0,
		});
	});

	test("an unspent grant stops being reserved once its hold lapses", async () => {
		const processor = await processorWith({ balance: 101 });
		await processor.track({
			command: trackOf({ value: 1 }),
			grantLane: "lane_a",
		});
		const after = T0 + TRACK_GRANT_TTL_MS + TRACK_GRANT_HOLD_MS;
		const all = await processor.track({
			command: trackOf({ value: 100, at: after }),
		});
		expect(all.result.status).toBe("applied");
	});

	test("near the limit (H < s·F) there is no grant: every track stays synchronous", async () => {
		// H = 3 after the track, under s·F = 4.
		const processor = await processorWith({ balance: 4 });
		const reply = await processor.track({
			command: trackOf({ value: 1 }),
			grantLane: "lane_a",
		});
		expect(reply.grant).toBeUndefined();
		expect(processor.readCounters()).toMatchObject({
			trackGrantsIssued: 0,
			trackGrantsWithheld: 1,
		});
	});

	test("refunds and locks are never granted", async () => {
		const processor = await processorWith();
		const refund = await processor.track({
			command: trackOf({ value: -5 }),
			grantLane: "lane_a",
		});
		expect(refund.grant).toBeUndefined();
		const locked: TrackCommand = {
			...trackOf({ value: 1, at: T0 + 1 }),
			lock: {
				id: "lock_row_1",
				lockId: "lock_1",
				expiresAt: T0 + 60_000,
				expiryAction: "release",
			},
		};
		const lockReply = await processor.track({
			command: locked,
			grantLane: "lane_a",
		});
		expect(lockReply.grant).toBeUndefined();
		expect(processor.readCounters().trackGrantsIssued).toBe(0);
	});

	test("a successor starts with no reservations and grants nothing until a predecessor's grants have lapsed", async () => {
		const owner = await processorWith({ balance: 401 });
		const granted = await owner.track({
			command: trackOf({ value: 1 }),
			grantLane: "lane_a",
		});
		const grant = granted.grant;
		if (!grant) throw new Error("expected a grant");
		// H = 400 → 100 units; the server answers 60 of them, all still queued when the owner dies.
		expect(grant.units).toBe(100);
		const queued = Array.from({ length: 6 }, (_, index) => ({
			...trackOf({
				value: 10,
				at: T0 + 10 + index,
				overageBehavior: "overflow",
			}),
			leaseId: grant.leaseId,
		}));

		const successor = await processorWith({ balance: 400, warm: false });
		const early = await successor.track({
			command: trackOf({ value: 1, at: T0 + 100 }),
			grantLane: "lane_a",
		});
		expect(early.grant).toBeUndefined();
		// Without reservations a sync track may take the whole balance the predecessor promised from.
		const drain = await successor.track({
			command: trackOf({ value: 399, at: T0 + 101 }),
		});
		expect(drain.result.status).toBe("applied");
		for (const command of queued) {
			const applied = await applyQueued({ processor: successor, command });
			expect(applied.mutation.result).toMatchObject({ status: "applied" });
		}
		// The overshoot is bounded by what was granted, which is at most H/s.
		const balance = await ownerBalance({ processor: successor, at: T0 + 200 });
		expect(balance).toBe(-60);
		expect(-balance).toBeLessThanOrEqual(Math.floor(400 / 4));
		expect(successor.readCounters().trackGrantedLate).toBe(6);

		const later = await successor.track({
			command: trackOf({
				value: -100,
				at: T0 + 100 + TRACK_GRANT_TTL_MS + TRACK_GRANT_HOLD_MS,
			}),
		});
		expect(later.result.status).toBe("applied");
		const regranted = await successor.track({
			command: trackOf({
				value: 1,
				at: T0 + 101 + TRACK_GRANT_TTL_MS + TRACK_GRANT_HOLD_MS,
			}),
			grantLane: "lane_a",
		});
		expect(regranted.grant?.units).toBeGreaterThan(0);
	});
});

describe("track grants end to end across lanes", () => {
	const seeds = Array.from({ length: 12 }, (_, index) => index + 1);

	for (const seed of seeds) {
		test(`seed ${seed}: no overshoot, and every track answered at a server is applied in full`, async () => {
			const random = randomOf(seed);
			const initial = 300 + Math.floor(random() * 400);
			const processor = await processorWith({ balance: initial });
			let clock = T0;
			const queue: TrackCommand[] = [];
			const lanes = Array.from(
				{ length: 2 + Math.floor(random() * 4) },
				(_, index) => {
					const lane = `lane_${index}`;
					const grants = createTrackGrants({
						ctx: { now: () => clock },
						config: { lane, maxEntries: 10, decide: decideGrantedTrack },
					});
					return { lane, grants };
				},
			);

			let answeredLocally = 0;
			let answeredUnits = 0;
			let ownerRejected = 0;
			const drainSome = async (count: number) => {
				for (const command of queue.splice(0, count)) {
					const committed = await applyQueued({ processor, command });
					// A leased track was promised to its caller: the ledger must take all of it.
					expect(committed.mutation.result).toMatchObject({
						status: "applied",
						reason: null,
					});
					const drawn = (
						committed.mutation.result as { deltas: { valueDelta: number }[] }
					).deltas.reduce((sum, delta) => sum - delta.valueDelta, 0);
					expect(drawn).toBe(command.value);
				}
			};

			for (let step = 0; step < 400; step++) {
				clock += Math.floor(random() * 15);
				const { lane, grants } =
					lanes[Math.floor(random() * lanes.length)] ?? lanes[0];
				// Mostly small tracks a grant covers; some large ones only the owner can decide.
				const value =
					random() < 0.2
						? 5 + Math.floor(random() * 20)
						: 1 + Math.floor(random() * 5);
				const command = trackOf({ at: clock, value });
				const reply = await grants.answer({
					command,
					send: () => processor.track({ command, grantLane: lane }),
					append: async (leased) => {
						queue.push(leased);
					},
				});
				if (reply.approximate) {
					answeredLocally++;
					expect(reply.result.status).toBe("applied");
				}
				if (reply.result.status === "applied") answeredUnits += command.value;
				else ownerRejected++;
				// The consumer lags the servers by a few commands at most.
				if (random() < 0.3) await drainSome(1 + Math.floor(random() * 4));
			}
			await drainSome(queue.length);

			const final = await ownerBalance({ processor, at: clock + 1 });
			expect(final).toBeGreaterThanOrEqual(0);
			expect(initial - final).toBe(answeredUnits);
			// The run actually exercised both paths and reached the limit.
			expect(answeredLocally).toBeGreaterThan(0);
			expect(ownerRejected).toBeGreaterThan(0);
			expect(processor.readCounters().trackGrantedLate).toBe(0);
		});
	}
});

/** A real client over the owner: `/v1/track` reaches the processor with the lane header it was sent. */
const clientOver = ({
	processor,
	lane,
	failAppend = () => false,
}: {
	processor: Processor;
	lane?: string;
	failAppend?: () => boolean;
}) => {
	const lanesSent: (string | undefined)[] = [];
	const queued: TrackCommand[] = [];
	async function postJson(request: HttpRequest): Promise<HttpResponse> {
		const { command } = request.body as { command: TrackCommand };
		const grantLane = request.headers?.[WORKER_TRACK_GRANT_LANE_HEADER];
		lanesSent.push(grantLane);
		return { status: 200, body: await processor.track({ command, grantLane }) };
	}
	const client = createBalanceWorkerClient({
		ctx: {
			owners: {
				findOwner: () => ({
					partition: 0,
					routeEpoch: "1",
					endpoint: "http://worker-a:8080",
				}),
				refresh: async () => undefined,
			},
			http: { postJson },
			commandLog: {
				append: async ({ records }) => {
					if (failAppend()) throw new Error("append failed");
					for (const record of records)
						queued.push(record.command as TrackCommand);
				},
			},
		},
		config: {
			partitionCount: 1,
			timeoutMs: 1_000,
			batchTracks: false,
			...(lane && {
				trackGrants: { lane, maxEntries: 10, decide: decideGrantedTrack },
			}),
		},
	});
	return { client, lanesSent, queued };
};

describe("track grants at the server", () => {
	test("without the flag a client names no lane and every track asks the owner", async () => {
		const processor = await processorWith();
		const { client, lanesSent, queued } = clientOver({ processor });
		for (let index = 0; index < 3; index++) {
			const reply = await client.track({
				command: trackOf({ at: Date.now() }),
			});
			expect(reply.approximate).toBeUndefined();
			expect(reply.grant).toBeUndefined();
		}
		expect(lanesSent).toEqual([undefined, undefined, undefined]);
		expect(queued).toEqual([]);
		expect(client.readTrackGrantCounters?.()).toBeNull();
	});

	test("inside a grant a track is queued with its lease before it is answered, approximately", async () => {
		const processor = await processorWith({ balance: 1_000 });
		const { client, lanesSent, queued } = clientOver({
			processor,
			lane: "lane_a",
		});
		const at = Date.now();
		const first = await client.track({ command: trackOf({ at, value: 2 }) });
		expect(first.grant?.units).toBe(100);
		const local = [];
		for (let index = 0; index < 5; index++)
			local.push(
				await client.track({ command: trackOf({ at: at + 1, value: 3 }) }),
			);
		expect(lanesSent).toEqual(["lane_a"]);
		for (const reply of local) {
			expect(reply.approximate).toBe(true);
			expect(reply.result.status).toBe("applied");
		}
		// The server's view: what the grant started from, less what it answered itself.
		expect(local.map(balanceOf)).toEqual([995, 992, 989, 986, 983]);
		expect(queued).toHaveLength(5);
		for (const command of queued) {
			expect(command.leaseId).toBe(first.grant?.leaseId);
			expect(command.overageBehavior).toBe("overflow");
		}
		for (const command of queued) await applyQueued({ processor, command });
		expect(await ownerBalance({ processor, at: at + 2 })).toBe(983);
		expect(client.readTrackGrantCounters?.()).toEqual({
			grantHit: 5,
			grantMiss: 1,
			grantIssued: 1,
			grantDropped: 0,
			size: 1,
		});
	});

	test("a failed append fails the track and drops the grant", async () => {
		const processor = await processorWith({ balance: 1_000 });
		let failing = false;
		const { client, lanesSent, queued } = clientOver({
			processor,
			lane: "lane_a",
			failAppend: () => failing,
		});
		const at = Date.now();
		await client.track({ command: trackOf({ at }) });
		failing = true;
		await expect(
			client.track({ command: trackOf({ at: at + 1 }) }),
		).rejects.toThrow();
		failing = false;
		const next = await client.track({ command: trackOf({ at: at + 2 }) });
		expect(next.approximate).toBeUndefined();
		expect(lanesSent).toHaveLength(2);
		expect(queued).toEqual([]);
	});

	test("refunds, locks, entities, properties and tracks larger than the grant go to the owner", async () => {
		const processor = await processorWith({ balance: 1_000 });
		const { client, lanesSent, queued } = clientOver({
			processor,
			lane: "lane_a",
		});
		const at = Date.now();
		await client.track({ command: trackOf({ at }) });
		const bypassed: TrackCommand[] = [
			trackOf({ at: at + 1, value: -1 }),
			trackOf({ at: at + 2, value: 101 }),
			{
				...trackOf({ at: at + 3 }),
				lock: {
					id: "lock_row_1",
					lockId: "lock_1",
					expiresAt: at + 60_000,
					expiryAction: "release",
				},
			},
			{ ...trackOf({ at: at + 4 }), properties: { model: "a" } },
		];
		for (const command of bypassed) {
			const reply = await client.track({ command });
			expect(reply.approximate).toBeUndefined();
		}
		expect(lanesSent).toHaveLength(1 + bypassed.length);
		expect(queued).toEqual([]);
	});

	test("a held grant lapses at the owner's expiry or the server's own cap, whichever is first", async () => {
		const processor = await processorWith({ balance: 1_000 });
		let clock = T0;
		const grants = createTrackGrants({
			ctx: { now: () => clock },
			config: {
				lane: "lane_a",
				maxEntries: 10,
				maxTtlMs: 400,
				decide: decideGrantedTrack,
			},
		});
		const queued: TrackCommand[] = [];
		const answer = (command: TrackCommand) =>
			grants.answer({
				command,
				send: () => processor.track({ command, grantLane: "lane_a" }),
				append: async (leased) => {
					queued.push(leased);
				},
			});
		await answer(trackOf({ at: T0 }));
		clock = T0 + 399;
		expect((await answer(trackOf({ at: clock }))).approximate).toBe(true);
		clock = T0 + 400;
		expect((await answer(trackOf({ at: clock }))).approximate).toBeUndefined();
		expect(queued).toHaveLength(1);
	});
});
