import { afterEach, describe, expect, test } from "bun:test";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import {
	readStageClock,
	timeStage,
} from "../../../src/threads/stats/stageClock.js";
import {
	checkRequestFor,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";
import {
	createSlotFolder,
	openSlotProcessor,
} from "../utils/journalFixtures.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

const busyFor = ({ ms }: { ms: number }) => {
	const until = performance.now() + ms;
	while (performance.now() < until) {}
};

/** The stage fields that grew while `run` ran, by how many µs. */
const stagesGrownBy = async (run: () => unknown) => {
	const before = readStageClock({ aliveUs: 0 });
	await run();
	const after = readStageClock({ aliveUs: 0 });
	return Object.fromEntries(
		Object.entries(after)
			.filter(
				([field, us]) =>
					field !== "stageOtherBusyUs" &&
					field !== "stageIdleUs" &&
					us > (before[field] ?? 0),
			)
			.map(([field, us]) => [field, us - (before[field] ?? 0)]),
	);
};

describe("the stage clock", () => {
	test("a stage counts its own time, not the stages nested inside it", async () => {
		const grown = await stagesGrownBy(() =>
			timeStage("viewRender", () => {
				busyFor({ ms: 10 });
				timeStage("engineDecision", () => busyFor({ ms: 20 }));
			}),
		);

		expect(Object.keys(grown).sort()).toEqual([
			"stageEngineDecisionUs",
			"stageViewRenderUs",
		]);
		expect(grown.stageEngineDecisionUs).toBeGreaterThanOrEqual(20_000);
		expect(grown.stageViewRenderUs).toBeGreaterThanOrEqual(10_000);
		expect(grown.stageViewRenderUs).toBeLessThan(20_000);
	});

	test("an async function counts up to its first await: waiting is not busy", async () => {
		const grown = await stagesGrownBy(() =>
			timeStage("settlePull", async () => {
				busyFor({ ms: 5 });
				await Bun.sleep(50);
			}),
		);

		expect(grown.stageSettlePullUs).toBeGreaterThanOrEqual(5_000);
		expect(grown.stageSettlePullUs).toBeLessThan(40_000);
	});

	test("a push is counted to pushApply, and a deducting check to the view, the engine's decision and the fold's append step, the journal's lookups and commit, and its JSON", async () => {
		const folder = createSlotFolder();
		const slot = openSlotProcessor({
			journal: openJournal({ databasePath: folder.journalPath }),
		});
		cleanups.push(slot.close, folder.remove);

		const pushed = await stagesGrownBy(() =>
			slot.processor.setSubject(
				subjectPushOf({ subject: storedSubjectWith({ balance: 1000 }) }),
			),
		);
		const checked = await stagesGrownBy(() =>
			slot.processor.check({
				request: checkRequestFor({
					params: { send_event: true, required_balance: 1 },
				}),
			}),
		);

		expect(Object.keys(pushed)).toEqual(["stagePushApplyUs"]);
		expect(Object.keys(checked).sort()).toEqual([
			"stageEngineDecisionUs",
			"stageEngineFoldStepUs",
			"stageHttpParseRespondUs",
			"stageJournalAppendUs",
			"stageJournalOwedUs",
			"stageViewRenderUs",
		]);
	});
});
