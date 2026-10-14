import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	type Catalog,
	computeTrackDecision,
	createSubjectState,
	type SubjectState,
	subjectStateToFullSubject,
	type TrackCommand,
	UnsupportedCommandError,
} from "@autumn/balance-engine";
import {
	EntInterval,
	getUsageWindowBounds,
	ResetInterval,
} from "@autumn/shared";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
	occurredAt,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { readCurrentSubject } from "../../../src/processor/actions/readCurrentSubject/readCurrentSubject.js";
import { replayOwed } from "../../../src/processor/actions/readCurrentSubject/replayOwed.js";
import type {
	JournalEntry,
	JournaledCommand,
} from "../../../src/state/journal/types/journal.js";
import { atomOrg } from "../utils/atomFixtures.js";
import { openSlotProcessor } from "../utils/journalFixtures.js";

/** Deterministic, so a failing seed reproduces. */
const seededRandom = (seed: number) => {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
};

const today = getUsageWindowBounds({
	interval: EntInterval.Day,
	now: occurredAt,
});

/** A customer with one to three message grants, some in overage, some with rollovers, some under a daily cap. */
const generateSubject = ({
	random,
}: {
	random: () => number;
}): { state: SubjectState; catalog: Catalog } => {
	const pick = (max: number) => Math.floor(random() * max);
	const customerEntitlements = Array.from(
		{ length: 1 + pick(3) },
		(_, index) => ({
			...createCustomerEntitlement({
				id: `messages_${index}`,
				balance: pick(200) - 20,
			}),
			usage_allowed: random() < 0.5,
		}),
	);
	const rollovers =
		random() < 0.5
			? [
					{
						id: "ro_messages",
						cus_ent_id: "messages_0",
						balance: pick(50),
						usage: 0,
						expires_at: occurredAt + 86_400_000,
						entities: {},
					},
				]
			: [];
	const capped = random() < 0.5;
	const state = createSubjectState({
		identity,
		customer: {
			internal_id: "cus_1",
			id: "cus_1",
			config: null,
			spend_limits: null,
			overage_allowed: null,
			usage_limits: capped
				? [
						{
							feature_id: "messages",
							enabled: true,
							limit: 50 + pick(150),
							interval: ResetInterval.Day,
						},
					]
				: null,
		},
		customerProducts: [createCustomerProduct()],
		customerEntitlements,
		rollovers,
		usageWindows: capped
			? [
					{
						id: "uw_messages",
						internal_customer_id: "cus_1",
						internal_entity_id: null,
						feature_id: "messages",
						internal_feature_id: "feat_messages",
						filter_key: null,
						anchor_customer_entitlement_id: null,
						window_start_at: today.windowStartAt,
						window_end_at: today.windowEndAt,
						usage: pick(40),
						updated_at: occurredAt - 1,
					},
				]
			: [],
	});
	return { state, catalog: createCatalogFor({ state }) };
};

/** What the Atom journals: granted already, so overflow; a few are for a feature nothing funds, which the worker refuses. */
const generateOwed = ({ random }: { random: () => number }): JournalEntry[] =>
	Array.from({ length: 1 + Math.floor(random() * 8) }, (_, index) => {
		const unfunded = random() < 0.15;
		const command: TrackCommand = {
			...createTrackCommand({
				commandId: `atom_req_${index}`,
				featureId: "messages",
				value: Math.floor(random() * 60) - 5,
				overageBehavior: "overflow",
			}),
			...(unfunded && { featureId: "seats", internalFeatureId: "feat_seats" }),
			enforceOverdueBlock: true,
		};
		return {
			customerId: "cus_1",
			writerId: "writer_1",
			seq: index + 1,
			appendedAt: occurredAt,
			command,
		};
	});

/** The balance worker's own loop (mutateTrack): decide on the rows so far, apply, next; a refused command moves nothing. */
const applyTheWorkersWay = ({
	state,
	catalog,
	commands,
}: {
	state: SubjectState;
	catalog: Catalog;
	commands: JournaledCommand[];
}): SubjectState => {
	let current = state;
	for (const command of commands) {
		if (command.type !== "track")
			throw new Error("these seeds journal tracks only");
		const fullSubject = subjectStateToFullSubject({
			state: current,
			catalog,
			entityId: command.identity.entityId,
		});
		try {
			const { mutation } = computeTrackDecision({ fullSubject, command });
			current = applyMutation({ state: current, mutation });
		} catch (error) {
			if (!(error instanceof UnsupportedCommandError)) throw error;
		}
	}
	return current;
};

describe("replaying what the Atom owes", () => {
	test("twin: for generated subjects and command lists, replay(pending, snapshot) equals the worker applying them in order, row for row", () => {
		for (let seed = 1; seed <= 200; seed++) {
			const random = seededRandom(seed);
			const { state, catalog } = generateSubject({ random });
			const owed = generateOwed({ random });

			const replayed = replayOwed({ owed, state, catalog });

			expect({ seed, state: replayed }).toEqual({
				seed,
				state: applyTheWorkersWay({
					state,
					catalog,
					commands: owed.map(({ command }) => command),
				}),
			});
		}
	});

	test("twin: the generated cases move every table they hold, so the comparison is not vacuous", () => {
		const moved = { customerEntitlements: 0, rollovers: 0, usageWindows: 0 };
		for (let seed = 1; seed <= 200; seed++) {
			const random = seededRandom(seed);
			const { state, catalog } = generateSubject({ random });
			const replayed = replayOwed({
				owed: generateOwed({ random }),
				state,
				catalog,
			});
			for (const table of Object.keys(moved) as (keyof typeof moved)[])
				if (JSON.stringify(replayed[table]) !== JSON.stringify(state[table]))
					moved[table]++;
		}

		expect(moved.customerEntitlements).toBeGreaterThan(0);
		expect(moved.rollovers).toBeGreaterThan(0);
		expect(moved.usageWindows).toBeGreaterThan(0);
	});

	test("twin: the view built step by step as appends and reads interleave equals the full replay after every read", async () => {
		for (let seed = 1; seed <= 100; seed++) {
			const random = seededRandom(seed);
			const { state, catalog } = generateSubject({ random });
			const { ctx, journal, close } = openSlotProcessor();
			try {
				ctx.sqliteStore.setSubject({
					subject: {
						state,
						catalog,
						org: atomOrg,
						logOffset: 1n,
						readAt: 1000,
						customerVersion: 0n,
					},
				});
				const appends: Promise<unknown>[] = [];
				for (const { command } of generateOwed({ random })) {
					appends.push(journal.append({ customerId: "cus_1", command }));
					if (random() < 0.6) continue;
					const view = readCurrentSubject({
						ctx,
						customerId: "cus_1",
						entityId: null,
					});
					const replayed = replayOwed({
						owed: journal.owed({ customerId: "cus_1" }),
						state,
						catalog,
					});
					expect({ seed, fullSubject: view.fullSubject }).toEqual({
						seed,
						fullSubject: subjectStateToFullSubject({
							state: replayed,
							catalog: view.catalog,
							entityId: null,
						}),
					});
				}
				await Promise.all(appends);
			} finally {
				close();
			}
		}
	});

	test("nothing owed is the snapshot itself", () => {
		const { state, catalog } = generateSubject({ random: seededRandom(7) });

		expect(replayOwed({ owed: [], state, catalog })).toBe(state);
	});
});
