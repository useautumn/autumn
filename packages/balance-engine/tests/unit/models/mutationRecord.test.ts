import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	type MutationEffect,
	onUnknownInput,
	parseMutationRecord,
	type UnknownInput,
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

	test("keeps an unknown key on a change and an unknown counter in it: an older build carries them through replay", () => {
		const logged = fromNewerWriter();
		logged.changes[0].futureField = true;
		logged.changes[0].add.futureCounter = 2;
		const parsed = parseMutationRecord({ input: logged });

		expect(parsed.changes[0]).toEqual(logged.changes[0]);
	});

	test("keeps an unknown key on the record, its receipt and its source", () => {
		const logged = {
			...fromNewerWriter(),
			futureField: true,
			source: { commandOffset: "7", futureField: true },
		};
		logged.receipt.futureField = true;

		expect(parseMutationRecord({ input: logged })).toEqual(logged);
	});

	test("skips a change of an unknown kind, applies the rest, and reports the kind once", () => {
		const sightings: UnknownInput[] = [];
		onUnknownInput((input) => sightings.push(input));
		const logged = fromNewerWriter();
		logged.changes = [
			{ table: "futureTable", op: "insert", row: { id: "ft_1" } },
			...logged.changes,
			{ table: "customerEntitlements", op: "futureOp", id: "ce_1" },
		];

		const parsed = parseMutationRecord({ input: logged });
		parseMutationRecord({ input: logged });

		expect(parsed.changes).toEqual(record.changes);
		expect(applyMutation({ state: createState(), mutation: parsed })).toEqual(
			applyMutation({ state: createState(), mutation: record }),
		);
		expect(sightings).toEqual([
			{
				kind: "row_change",
				table: "futureTable",
				op: "insert",
				commandId: record.id,
				identity: record.identity,
			},
			{
				kind: "row_change",
				table: "customerEntitlements",
				op: "futureOp",
				commandId: record.id,
				identity: record.identity,
			},
		]);
	});

	test("a malformed change of a known kind is still refused, not skipped", () => {
		const logged = fromNewerWriter();
		logged.changes = [
			{ table: "customerEntitlements", op: "delete", id: 5 },
			...logged.changes,
		];

		expect(() => parseMutationRecord({ input: logged })).toThrow();
	});
});
