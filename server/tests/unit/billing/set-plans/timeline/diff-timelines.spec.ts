import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import { describeOperations, describeTransitions } from "./timelineDescribe";
import {
	B,
	B2,
	C,
	desiredSegment,
	desiredTimeline,
	NOW,
	PAST,
	plan,
	policiesFor,
	savedRow,
} from "./timelineFixtures";
import { expectAllInvariants, expectIdempotent } from "./timelineInvariants";

const pro = plan({ planId: "pro" });
const ent = plan({ planId: "ent" });
const hobby = plan({ planId: "hobby" });
const sso = plan({ planId: "sso", kind: "addOn" });
const credits = plan({ planId: "credits", kind: "oneOff" });

describe(chalk.yellowBright("diffTimelines: audit cases"), () => {
	test("case 1: a plan added to the opening phase only ends with it, shown on its Created row", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro, endsAt: B }),
				savedRow({ id: "ent_row", plan: ent, startsAt: B }),
			],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: pro, endsAt: B }),
					desiredSegment({ plan: sso, endsAt: B }),
					desiredSegment({ plan: ent, startsAt: B, phaseIndex: 1 }),
				],
			}),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual(["insert:sso:h1:now-B"]);
		expect(describeTransitions(diff)).toEqual([
			"B:ends:saved:pro:h1",
			"B:starts:saved:ent:h1",
			"now:continues:request:pro:h1->pro:h1",
			"now:starts:request:sso:h1",
		]);
	});

	test("case 2: editing a plan now that a saved phase reverts reuses the saved row", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "ent_live", plan: ent, endsAt: B }),
				savedRow({ id: "ent_later", plan: ent, startsAt: B }),
			],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: ent, hash: "custom", endsAt: B }),
					desiredSegment({ plan: ent, startsAt: B, phaseIndex: 1 }),
				],
			}),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual([
			"expire:ent_live",
			"insert:ent:custom:now-B",
		]);
		expect(describeTransitions(diff)).toEqual([
			"B:updated:request:ent:custom->ent:h1",
			"now:updated:request:ent:h1->ent:custom",
		]);
	});

	test("case 3: switching Pro for Hobby ends the unlisted SSO, or keeps it when retained", () => {
		const rows = [
			savedRow({ id: "pro_row", plan: pro }),
			savedRow({ id: "sso_row", plan: sso }),
		];
		const desired = desiredTimeline({
			segments: [desiredSegment({ plan: hobby })],
		});

		const ended = expectAllInvariants({
			rows,
			desired,
			policies: policiesFor(),
		});
		expect(describeOperations(ended.diff)).toEqual([
			"expire:pro_row",
			"expire:sso_row",
			"insert:hobby:h1:now-never",
		]);
		expect(describeTransitions(ended.diff)).toEqual([
			"now:ends:request:pro:h1",
			"now:ends:request:sso:h1",
			"now:starts:request:hobby:h1",
		]);

		const retained = expectAllInvariants({
			rows,
			desired,
			policies: policiesFor({ undeclared: "retain" }),
		});
		expect(describeOperations(retained.diff)).toEqual([
			"expire:pro_row",
			"insert:hobby:h1:now-never",
		]);
		expect(describeTransitions(retained.diff)).toEqual([
			"now:continues:request:sso:h1->sso:h1",
			"now:ends:request:pro:h1",
			"now:starts:request:hobby:h1",
		]);
	});

	test("case 4: a saved end the request keeps shows as a muted end", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro }),
				savedRow({ id: "sso_row", plan: sso, endsAt: B }),
			],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: pro }),
					desiredSegment({ plan: sso, endsAt: B, planIndex: 1 }),
				],
			}),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual([]);
		expect(describeTransitions(diff)).toEqual([
			"B:ends:saved:sso:h1",
			"now:continues:request:pro:h1->pro:h1",
			"now:continues:request:sso:h1->sso:h1",
		]);
	});

	test("case 5: a saved replacement reads as a muted end and start, never a removal", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro, endsAt: B }),
				savedRow({ id: "ent_row", plan: ent, startsAt: B }),
			],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: pro, endsAt: B }),
					desiredSegment({ plan: ent, startsAt: B, phaseIndex: 1 }),
				],
			}),
			policies: policiesFor(),
		});

		expectIdempotent({ diff });
		expect(describeTransitions(diff)).toEqual([
			"B:ends:saved:pro:h1",
			"B:starts:saved:ent:h1",
			"now:continues:request:pro:h1->pro:h1",
		]);
	});

	test("case 6: removing an ongoing plan ends it now", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro }),
				savedRow({ id: "sso_row", plan: sso }),
			],
			desired: desiredTimeline({ segments: [desiredSegment({ plan: pro })] }),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual(["expire:sso_row"]);
		expect(describeTransitions(diff)).toEqual([
			"now:continues:request:pro:h1->pro:h1",
			"now:ends:request:sso:h1",
		]);
	});

	test("case 7: a new phase with a customized plan re-times the running row and starts the new config", () => {
		const { diff } = expectAllInvariants({
			rows: [savedRow({ id: "pro_row", plan: pro })],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: pro, endsAt: C }),
					desiredSegment({
						plan: pro,
						hash: "custom",
						startsAt: C,
						phaseIndex: 1,
					}),
				],
			}),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual([
			"insert:pro:custom:C-never",
			"retime:pro_row:C",
		]);
		expect(describeTransitions(diff)).toEqual([
			"C:updated:request:pro:h1->pro:custom",
			"now:continues:request:pro:h1->pro:h1",
		]);
	});

	test("case 7b: an unchanged plan re-sent is a no-op", () => {
		const { diff } = expectAllInvariants({
			rows: [savedRow({ id: "pro_row", plan: pro, hash: "custom" })],
			desired: desiredTimeline({
				segments: [desiredSegment({ plan: pro, hash: "custom" })],
			}),
			policies: policiesFor(),
		});
		expectIdempotent({ diff });
	});
});

describe(chalk.yellowBright("diffTimelines: audit matrix failures"), () => {
	test("a main plan placed by attach and left out ends now, or is retained", () => {
		const rows = [savedRow({ id: "pro_row", plan: pro })];
		const desired = desiredTimeline({
			segments: [desiredSegment({ plan: sso })],
		});

		const ended = expectAllInvariants({
			rows,
			desired,
			policies: policiesFor(),
		});
		expect(describeOperations(ended.diff)).toEqual([
			"expire:pro_row",
			"insert:sso:h1:now-never",
		]);

		const retained = expectAllInvariants({
			rows,
			desired,
			policies: policiesFor({ undeclared: "retain" }),
		});
		expect(describeOperations(retained.diff)).toEqual([
			"insert:sso:h1:now-never",
		]);
	});

	test("a re-listed one-off purchase is never bought again, and an unlisted one never ends", () => {
		const rows = [
			savedRow({ id: "pro_row", plan: pro }),
			savedRow({ id: "credits_row", plan: credits }),
		];

		const relisted = expectAllInvariants({
			rows,
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: pro }),
					desiredSegment({ plan: credits, planIndex: 1 }),
				],
			}),
			policies: policiesFor(),
		});
		expectIdempotent({ diff: relisted.diff });

		const unlisted = expectAllInvariants({
			rows,
			desired: desiredTimeline({ segments: [desiredSegment({ plan: pro })] }),
			policies: policiesFor(),
		});
		expectIdempotent({ diff: unlisted.diff });
	});

	test("a canceling plan re-listed unchanged keeps its row and its cancellation", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro, endsAt: C, canceling: true }),
			],
			desired: desiredTimeline({ segments: [desiredSegment({ plan: pro })] }),
			policies: policiesFor(),
		});

		expectIdempotent({ diff });
		expect(describeTransitions(diff)).toEqual([
			"C:ends:saved:pro:h1",
			"now:continues:request:pro:h1->pro:h1",
		]);
	});

	test("a canceling plan given an explicit later end runs to that end instead", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro, endsAt: B, canceling: true }),
			],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: pro, endsAt: C }),
					desiredSegment({ plan: ent, startsAt: C, phaseIndex: 1 }),
				],
			}),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual([
			"insert:ent:h1:C-never",
			"retime:pro_row:C",
		]);
	});

	test("a canceling plan is recreated when the policy asks for it", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro, endsAt: C, canceling: true }),
			],
			desired: desiredTimeline({ segments: [desiredSegment({ plan: pro })] }),
			policies: policiesFor({ canceling: "recreate" }),
		});

		expect(describeOperations(diff)).toEqual([
			"expire:pro_row",
			"insert:pro:h1:now-never",
		]);
	});

	test("a past-due plan re-listed unchanged continues", () => {
		const { diff } = expectAllInvariants({
			rows: [savedRow({ id: "pro_row", plan: pro, pastDue: true })],
			desired: desiredTimeline({ segments: [desiredSegment({ plan: pro })] }),
			policies: policiesFor(),
		});
		expectIdempotent({ diff });
	});

	test("a phase plan moved to ongoing no longer ends", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro }),
				savedRow({ id: "sso_row", plan: sso, endsAt: B }),
			],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: pro }),
					desiredSegment({ plan: sso, ongoing: true }),
				],
			}),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual(["retime:sso_row:never"]);
		expect(describeTransitions(diff)).toEqual([
			"B:ends:withdrawn:sso:h1",
			"now:continues:request:pro:h1->pro:h1",
			"now:continues:request:sso:h1->sso:h1",
		]);
	});

	test("moving a saved phase re-times the running plan and moves the replacement", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro, endsAt: B }),
				savedRow({ id: "ent_row", plan: ent, startsAt: B }),
			],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: pro, endsAt: B2 }),
					desiredSegment({ plan: ent, startsAt: B2, phaseIndex: 1 }),
				],
			}),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual([
			"delete:ent_row",
			"insert:ent:h1:B2-never",
			"retime:pro_row:B2",
		]);
		expect(describeTransitions(diff)).toEqual([
			"B2:ends:request:pro:h1",
			"B2:starts:request:ent:h1",
			"B:ends:withdrawn:pro:h1",
			"B:starts:withdrawn:ent:h1",
			"now:continues:request:pro:h1->pro:h1",
		]);
	});

	test("deleting a saved phase lets the running plan continue and withdraws the replacement", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro, endsAt: B }),
				savedRow({ id: "ent_row", plan: ent, startsAt: B }),
			],
			desired: desiredTimeline({ segments: [desiredSegment({ plan: pro })] }),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual([
			"delete:ent_row",
			"retime:pro_row:never",
		]);
		expect(describeTransitions(diff)).toEqual([
			"B:ends:withdrawn:pro:h1",
			"B:starts:withdrawn:ent:h1",
			"now:continues:request:pro:h1->pro:h1",
		]);
	});

	test("a new phase that leaves out a running plan shows its end", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro }),
				savedRow({ id: "sso_row", plan: sso }),
			],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: pro }),
					desiredSegment({ plan: sso, endsAt: C, planIndex: 1 }),
				],
			}),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual(["retime:sso_row:C"]);
		expect(describeTransitions(diff)).toContain("C:ends:request:sso:h1");
	});

	test("a phase inserted between saved phases re-times rows instead of recreating them", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro, endsAt: C }),
				savedRow({ id: "ent_row", plan: ent, startsAt: C }),
			],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: pro, endsAt: B }),
					desiredSegment({
						plan: pro,
						hash: "custom",
						startsAt: B,
						endsAt: C,
						phaseIndex: 1,
					}),
					desiredSegment({ plan: ent, startsAt: C, phaseIndex: 2 }),
				],
			}),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual([
			"insert:pro:custom:B-C",
			"retime:pro_row:B",
		]);
	});

	test("a legacy saved schedule split into one row per phase reads as one unchanged plan", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_now", plan: pro, endsAt: B }),
				savedRow({ id: "pro_later", plan: pro, startsAt: B }),
				savedRow({ id: "sso_later", plan: sso, startsAt: B }),
			],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: pro }),
					desiredSegment({ plan: sso, startsAt: B, phaseIndex: 1 }),
				],
			}),
			policies: policiesFor(),
		});

		expectIdempotent({ diff });
	});

	test("the schedule end date ends retained plans on the live subscription only", () => {
		const free = plan({ planId: "free_addon", kind: "free", group: "free" });
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "sso_row", plan: sso }),
				savedRow({ id: "free_row", plan: free }),
			],
			desired: desiredTimeline({
				segments: [desiredSegment({ plan: pro, endsAt: C })],
				endsAt: C,
			}),
			policies: policiesFor({ undeclared: "retain" }),
		});

		expect(describeOperations(diff)).toEqual([
			"insert:pro:h1:now-C",
			"retime:sso_row:C",
		]);
	});

	test("a replaced subscription recreates live plans when a paid plan starts", () => {
		const { diff } = expectAllInvariants({
			rows: [savedRow({ id: "sso_row", plan: sso })],
			desired: desiredTimeline({
				segments: [
					desiredSegment({ plan: sso }),
					desiredSegment({ plan: pro, planIndex: 1 }),
				],
			}),
			policies: policiesFor({ liveRows: "recreateWhenPaidRecurringStarts" }),
		});

		expect(describeOperations(diff)).toEqual([
			"expire:sso_row",
			"insert:pro:h1:now-never",
			"insert:sso:h1:now-never",
		]);
	});
});

describe(chalk.yellowBright("diffTimelines: boundaries"), () => {
	test("a saved scheduled plan the request drops won't start", () => {
		const { diff } = expectAllInvariants({
			rows: [
				savedRow({ id: "pro_row", plan: pro }),
				savedRow({ id: "sso_row", plan: sso, startsAt: B }),
			],
			desired: desiredTimeline({ segments: [desiredSegment({ plan: pro })] }),
			policies: policiesFor(),
		});

		expect(describeOperations(diff)).toEqual(["delete:sso_row"]);
		expect(describeTransitions(diff)).toContain("B:starts:withdrawn:sso:h1");
	});

	test("a saved past start never surfaces as a boundary", () => {
		const { diff } = expectAllInvariants({
			rows: [savedRow({ id: "pro_row", plan: pro, startsAt: PAST })],
			desired: desiredTimeline({ segments: [desiredSegment({ plan: pro })] }),
			policies: policiesFor(),
		});
		expect(diff.transitions.every(({ at }) => at >= NOW)).toBe(true);
	});
});
