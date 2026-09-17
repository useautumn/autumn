import { describe, expect, test } from "bun:test";
import * as balanceEngine from "../../src/balanceEngine.js";
import {
	type CustomerStateMutation,
	computeInitialize,
	computeTrack,
	meteringPartitionKeyOf,
	mutationFingerprintOf,
	parseCustomerState,
	parseCustomerStateMutation,
	parseTrackCommand,
	shadowComparisonKeyOf,
} from "../../src/balanceEngine.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createInitializeCommand,
	createState,
	createTrackCommand,
	deduplicationExpiresAt,
	identity,
	requireNewMutation,
} from "./engineFixtures.js";

const trackMutation = requireNewMutation(
	computeTrack({
		state: createState(),
		catalog: createCatalogFor({ state: createState() }),
		command: createTrackCommand(),
		deduplicationExpiresAt,
	}),
);
const initializeMutation = computeInitialize({
	command: createInitializeCommand(),
	deduplicationExpiresAt,
});

const refingerprinted = ({
	mutation,
}: {
	mutation: CustomerStateMutation;
}): CustomerStateMutation => ({
	...mutation,
	receipt: {
		...mutation.receipt,
		fingerprint: mutationFingerprintOf({ mutation }),
	},
});

describe("balance engine contract boundaries", () => {
	test("round-trips every record through JSON", () => {
		for (const mutation of [trackMutation, initializeMutation]) {
			expect(
				parseCustomerStateMutation({
					input: JSON.parse(JSON.stringify(mutation)),
				}),
			).toEqual(mutation);
		}
		expect(
			parseCustomerState({ input: JSON.parse(JSON.stringify(createState())) }),
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
		const initializeWithUpdate = refingerprinted({
			mutation: {
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
			},
		});
		const initializeAfterRevisionZero = {
			...initializeMutation,
			revision: { before: 1, after: 2 },
		};
		const wrongFingerprint = {
			...trackMutation,
			receipt: { ...trackMutation.receipt, fingerprint: "not_the_command" },
		};

		for (const input of [
			revisionGap,
			kindMismatch,
			initializeWithUpdate,
			initializeAfterRevisionZero,
			wrongFingerprint,
		]) {
			expect(() => parseCustomerStateMutation({ input })).toThrow();
		}
	});

	test("state rows carry only the columns the engine reads", () => {
		expect(() =>
			parseCustomerState({
				input: {
					...createState(),
					customerEntitlements: [
						{ ...createCustomerEntitlement(), cache_version: 3 },
					],
				},
			}),
		).toThrow();
	});

	test("keeps receipt-retention policy out of caller track commands", () => {
		expect(() =>
			parseTrackCommand({ input: { ...createTrackCommand() } }),
		).not.toThrow();
		expect(() =>
			parseTrackCommand({
				input: { ...createTrackCommand(), deduplicationExpiresAt },
			}),
		).toThrow();
		expect(() =>
			parseTrackCommand({
				input: { ...createTrackCommand(), schemaVersion: 2 },
			}),
		).toThrow();
		expect(() =>
			parseTrackCommand({ input: { ...createTrackCommand(), value: 0 } }),
		).toThrow();
	});

	test("rejects properties that cannot survive JSON transport", () => {
		expect(() => createTrackCommand({ properties: { unsafe: 1n } })).toThrow();
		expect(() =>
			createTrackCommand({ properties: { unsafe: undefined } }),
		).toThrow();
	});

	test("builds customer ordering and exact shadow comparison keys", () => {
		expect(meteringPartitionKeyOf({ identity })).toBe(
			'["org_1","sandbox","cus_1"]',
		);
		expect(shadowComparisonKeyOf({ command: createTrackCommand() })).toBe(
			'["org_1","sandbox","cus_1","messages","cmd_1"]',
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
