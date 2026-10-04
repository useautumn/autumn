/**
 * Sync tracks for one subject arriving together are decided as one run. A run is a pure speed-up: a
 * processor with runs answers every command, duplicates and refusals included, exactly as one that
 * decides each track alone.
 */

import { describe, expect, test } from "bun:test";
import {
	createSubjectState,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import { serializeSubjectReply } from "../../../src/http/replies/serializeSubjectReply.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	testOccurredAt,
} from "../../fixtures/mutations.js";
import {
	createResidentProcessor,
	residentIdentityOf,
} from "../../fixtures/residentProcessor.js";

const customers = ["cus_1", "cus_2", "cus_3"];

/** Low balances on two features, one able to run over, so draws cross zero, get refused, and refunds lift them. */
const stateOf = ({ customerId }: { customerId: string }): SubjectState =>
	createSubjectState({
		identity: residentIdentityOf({ customerId }),
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [
			createCustomerEntitlement({
				id: `${customerId}_messages`,
				featureId: "messages",
				balance: 9,
			}),
			{
				...createCustomerEntitlement({
					id: `${customerId}_words`,
					featureId: "words",
					balance: 4,
				}),
				usage_allowed: true,
			},
		],
	});

const seededRandom = (seed: number) => {
	let value = seed;
	return () => {
		value = (value + 0x6d2b79f5) | 0;
		let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
};

/** 800 tracks in bursts over three customers; some resend an earlier command, a few reuse its id for another value. */
const randomBursts = ({ seed }: { seed: number }): TrackCommand[][] => {
	const random = seededRandom(seed);
	const integer = (min: number, max: number) =>
		min + Math.floor(random() * (max - min + 1));
	const sent: TrackCommand[] = [];
	const bursts: TrackCommand[][] = [];
	for (let burst = 0; sent.length < 800; burst++)
		bursts.push(
			Array.from(
				{ length: Math.min(integer(1, 12), 800 - sent.length) },
				(_, index) => {
					const earlier = sent[integer(0, sent.length - 1)];
					const roll = random();
					if (earlier && roll < 0.08) return earlier;
					const command = createTrackCommand({
						identity: residentIdentityOf({
							customerId: customers[integer(0, customers.length - 1)] ?? "",
						}),
						commandId:
							earlier && roll < 0.11
								? earlier.commandId
								: `trk_${seed}_${burst}_${index}`,
						featureId: random() < 0.5 ? "messages" : "words",
						value: integer(-3, 6),
						overageBehavior: random() < 0.3 ? "cap" : "reject",
						occurredAt: testOccurredAt + burst * 1_000 + index,
					});
					sent.push(command);
					return command;
				},
			),
		);
	return bursts;
};

type Answer = { reply: string } | { error: string };

const answerOf = (settled: PromiseSettledResult<object>): Answer =>
	settled.status === "fulfilled"
		? { reply: serializeSubjectReply({ reply: settled.value }) }
		: {
				error: `${(settled.reason as Error).name}: ${(settled.reason as Error).message}`,
			};

const answersOf = async ({
	decidesTrackRuns,
	bursts,
	sharesRunSnapshot = false,
}: {
	decidesTrackRuns: boolean;
	bursts: TrackCommand[][];
	sharesRunSnapshot?: boolean;
}): Promise<Answer[]> => {
	const processor = await createResidentProcessor({
		states: customers.map((customerId) => stateOf({ customerId })),
		config: { decidesTrackRuns, sharesRunSnapshot },
	});
	const answers: Answer[] = [];
	for (const burst of bursts) {
		const settled = await Promise.allSettled(
			burst.map((command) => processor.track({ command })),
		);
		answers.push(...settled.map(answerOf));
	}
	await processor.drain();
	return answers;
};

describe("track runs", () => {
	for (const seed of [1, 2, 3, 4, 5])
		test(`answers every burst as a processor deciding each track alone (seed ${seed})`, async () => {
			const bursts = randomBursts({ seed });
			const alone = await answersOf({ decidesTrackRuns: false, bursts });
			const inRuns = await answersOf({ decidesTrackRuns: true, bursts });
			expect(inRuns).toEqual(alone);
			expect(alone.some((answer) => "error" in answer)).toBe(true);
			expect(
				alone.filter((answer) => "reply" in answer).length,
			).toBeGreaterThan(bursts.flat().length / 2);
		});

	test("a shared run snapshot answers each track's own result and changes, with the subject as the run left it", async () => {
		const burst = Array.from({ length: 6 }, (_, index) =>
			createTrackCommand({
				identity: residentIdentityOf({ customerId: "cus_1" }),
				commandId: `trk_shared_${index}`,
				featureId: "words",
				value: 1,
				occurredAt: testOccurredAt + index,
			}),
		);
		const parse = (answers: Answer[]) =>
			answers.map((answer) =>
				"reply" in answer ? JSON.parse(answer.reply) : answer,
			);
		const exact = parse(
			await answersOf({ decidesTrackRuns: true, bursts: [burst] }),
		);
		const shared = parse(
			await answersOf({
				decidesTrackRuns: true,
				bursts: [burst],
				sharesRunSnapshot: true,
			}),
		);

		expect(shared.map(({ result, changes }) => ({ result, changes }))).toEqual(
			exact.map(({ result, changes }) => ({ result, changes })),
		);
		const last = exact.at(-1)?.state;
		expect(
			shared.every((reply) => reply.state.revision === last.revision),
		).toBe(true);
		expect(exact[0].state.revision).toBeLessThan(last.revision);
	});
});
