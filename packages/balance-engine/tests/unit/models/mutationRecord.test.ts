import { describe, expect, test } from "bun:test";
import {
	computeTrack,
	type MutationEffect,
	parseMutationRecord,
} from "../../../src/balanceEngine.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
} from "../engineFixtures.js";

const receipt = { fingerprint: "fp_1", expiresAt: 1_700_086_400_000 };

const record = {
	...computeTrack({
		fullSubject: createSubjectFor({ state: createState() }),
		command: createTrackCommand(),
	}),
	receipt,
};

const effects: MutationEffect[] = [
	{
		type: "balance_webhook",
		eventType: "balances.limit_reached",
		data: { customer_id: "cus_1", feature_id: "messages" },
		tags: ["customer_id:cus_1"],
	},
	{
		type: "auto_topup",
		featureId: "messages",
		reason: "balance_below_threshold",
	},
];

const roundTrip = (input: unknown) =>
	parseMutationRecord({ input: JSON.parse(JSON.stringify(input)) });

describe("mutation record effects", () => {
	test("a record carries its effects through JSON, or none at all", () => {
		expect(roundTrip({ ...record, effects })).toEqual({ ...record, effects });
		expect(roundTrip(record).effects).toBeUndefined();
	});

	test("an effect keeps a field a newer worker stamps", () => {
		const stamped = { ...effects[1], autoTopupConfig: { threshold: 10 } };

		expect(roundTrip({ ...record, effects: [stamped] }).effects).toEqual([
			stamped,
		]);
	});

	test("an effect of a kind the engine does not know is refused", () => {
		expect(() =>
			roundTrip({
				...record,
				effects: [{ type: "cache_push", customerId: "cus_1" }],
			}),
		).toThrow();
	});
});
