import { describe, expect, test } from "bun:test";
import {
	computeTrack,
	parseMutationRecord,
	parseSubjectStateMutation,
} from "../../../src/balanceEngine.js";
import {
	createEvictRecord,
	createState,
	createSubjectFor,
	createSummaryView,
	createTrackCommand,
	withSummary,
} from "../engineFixtures.js";

const receipt = { fingerprint: "fp_1", expiresAt: 1_700_086_400_000 };

const trackRecord = {
	...computeTrack({
		fullSubject: createSubjectFor({ state: createState() }),
		command: createTrackCommand(),
	}),
	receipt,
};

const roundTrip = (input: unknown) =>
	parseMutationRecord({ input: JSON.parse(JSON.stringify(input)) });

describe("mutation record summary", () => {
	test("a record carries its summary through JSON, or none at all", () => {
		const stamped = withSummary({
			mutation: trackRecord,
			views: [createSummaryView()],
		});

		expect(roundTrip(stamped)).toEqual(stamped);
		expect(roundTrip(trackRecord).summary).toBeUndefined();
	});

	test("only the record carries a summary, never the bare mutation", () => {
		const { receipt: _receipt, ...mutation } = trackRecord;

		expect(() =>
			parseSubjectStateMutation({
				input: JSON.parse(
					JSON.stringify(
						withSummary({ mutation, views: [createSummaryView()] }),
					),
				),
			}),
		).toThrow();
	});

	test("a view keeps a field a newer worker stamps", () => {
		const view = { ...createSummaryView(), unlimited: false };

		expect(
			roundTrip(withSummary({ mutation: trackRecord, views: [view] })).summary,
		).toEqual([view]);
	});

	test("a view describes a balance that begins or ends", () => {
		const begins = createSummaryView({ before: null });
		const ends = createSummaryView({ after: null });

		expect(
			roundTrip(withSummary({ mutation: trackRecord, views: [begins, ends] }))
				.summary,
		).toEqual([begins, ends]);
	});

	test("a view with neither a before nor an after is refused", () => {
		expect(() =>
			roundTrip(
				withSummary({
					mutation: trackRecord,
					views: [createSummaryView({ before: null, after: null })],
				}),
			),
		).toThrow();
	});

	test("a track's summary carries totals only", () => {
		const view = createSummaryView({
			rows: [
				{
					id: "messages_monthly",
					planId: null,
					before: { remaining: 10, usage: 990 },
					after: { remaining: 5, usage: 995 },
				},
			],
		});

		expect(() =>
			roundTrip(withSummary({ mutation: trackRecord, views: [view] })),
		).toThrow();
	});

	test("an evict carries no summary", () => {
		expect(() =>
			roundTrip(
				withSummary({
					mutation: createEvictRecord(),
					views: [createSummaryView()],
				}),
			),
		).toThrow();
	});
});
