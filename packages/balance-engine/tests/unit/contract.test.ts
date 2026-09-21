import { describe, expect, test } from "bun:test";
import * as balanceEngine from "../../src/balanceEngine.js";
import {
	computeInitialize,
	computeTrack,
	meteringIdentityToPartitionKey,
	parseMutationRecord,
	parseSubjectState,
	parseSubjectStateMutation,
	parseTrackCommand,
	type SubjectStateMutation,
} from "../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createInitializeRequest,
	createState,
	createSubjectFor,
	createTrackCommand,
	identity,
} from "./engineFixtures.js";

const trackMutation = computeTrack({
	fullSubject: createSubjectFor({ state: createState() }),
	command: createTrackCommand(),
});
const initializeMutation = computeInitialize(createInitializeRequest());

const receipt = { fingerprint: "fp_1", expiresAt: 1_700_086_400_000 };

describe("balance engine contract boundaries", () => {
	test("round-trips every record through JSON", () => {
		for (const mutation of [trackMutation, initializeMutation]) {
			expect(
				parseSubjectStateMutation({
					input: JSON.parse(JSON.stringify(mutation)),
				}),
			).toEqual(mutation);
			const record = { ...mutation, receipt };
			expect(
				parseMutationRecord({ input: JSON.parse(JSON.stringify(record)) }),
			).toEqual(record);
			expect(() => parseSubjectStateMutation({ input: record })).toThrow();
		}
		expect(
			parseSubjectState({ input: JSON.parse(JSON.stringify(createState())) }),
		).toEqual(createState());
	});

	test("refuses mutations whose envelope contradicts itself", () => {
		const revisionGap = {
			...trackMutation,
			revision: { before: 0, after: 2 },
		};
		const kindMismatch = {
			...initializeMutation,
			result: trackMutation.result,
		};
		const initializeWithUpdate: SubjectStateMutation = {
			...initializeMutation,
			changes: [
				{
					table: "customerEntitlements",
					op: "update",
					id: "messages_monthly",
					before: { balance: 10 },
					after: { balance: 5 },
				},
			],
		};
		const initializeAfterRevisionZero = {
			...initializeMutation,
			revision: { before: 1, after: 2 },
		};

		for (const input of [
			revisionGap,
			kindMismatch,
			initializeWithUpdate,
			initializeAfterRevisionZero,
		]) {
			expect(() => parseSubjectStateMutation({ input })).toThrow();
			expect(() =>
				parseMutationRecord({ input: { ...input, receipt } }),
			).toThrow();
		}
	});

	test("state rows carry only the columns the engine reads", () => {
		expect(() =>
			parseSubjectState({
				input: {
					...createState(),
					customerEntitlements: [
						{ ...createCustomerEntitlement(), cache_version: 3 },
					],
				},
			}),
		).toThrow();
	});

	test("keeps the writer's receipt out of commands", () => {
		expect(() =>
			parseTrackCommand({ input: { ...createTrackCommand() } }),
		).not.toThrow();
		expect(() =>
			parseTrackCommand({ input: { ...createTrackCommand(), receipt } }),
		).toThrow();
		expect(() =>
			parseTrackCommand({
				input: { ...createTrackCommand(), schemaVersion: 2 },
			}),
		).toThrow();
		// Zero is legal: a lock of 0 holds nothing and can still be confirmed above it.
		expect(
			parseTrackCommand({ input: { ...createTrackCommand(), value: 0 } }).value,
		).toBe(0);
	});

	test("rejects properties that cannot survive JSON transport", () => {
		expect(() => createTrackCommand({ properties: { unsafe: 1n } })).toThrow();
		expect(() =>
			createTrackCommand({ properties: { unsafe: undefined } }),
		).toThrow();
	});

	test("builds the customer ordering key", () => {
		expect(meteringIdentityToPartitionKey({ identity })).toBe(
			'["org_1","sandbox","cus_1"]',
		);
	});

	test("keeps validation libraries behind parser functions", () => {
		expect(
			Object.keys(balanceEngine).filter((exportName) =>
				exportName.endsWith("Schema"),
			),
		).toEqual([]);
	});
});
