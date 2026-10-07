import { describe, expect, test } from "bun:test";
import {
	applyMutation,
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

/** The record as a newer writer logs it: its command carries fields this build does not know. */
const fromNewerWriter = () => {
	const logged = JSON.parse(JSON.stringify(record));
	logged.command.futureField = true;
	logged.command.org.config.future_setting = "on";
	return logged;
};

describe("a record from a newer writer", () => {
	test("replays: its command is read as written, unknown keys included", () => {
		const logged = fromNewerWriter();
		const parsed = parseMutationRecord({ input: logged });

		expect(parsed.command).toEqual(logged.command);
		expect(applyMutation({ state: createState(), mutation: parsed })).toEqual(
			applyMutation({ state: createState(), mutation: record }),
		);
	});

	test("is still refused for an unknown key in its changes: replay must derive the same rows", () => {
		const logged = fromNewerWriter();
		logged.changes[0].futureField = true;

		expect(() => parseMutationRecord({ input: logged })).toThrow(
			"Unrecognized key",
		);
	});

	test("is still refused for an unknown key on the record, its receipt or its source", () => {
		const onRecord = { ...fromNewerWriter(), futureField: true };
		const onReceipt = fromNewerWriter();
		onReceipt.receipt.futureField = true;
		const onSource = {
			...fromNewerWriter(),
			source: { commandOffset: "7", futureField: true },
		};

		for (const input of [onRecord, onReceipt, onSource]) {
			expect(() => parseMutationRecord({ input })).toThrow("Unrecognized key");
		}
	});
});
