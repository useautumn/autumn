import { describe, expect, test } from "bun:test";
import { ByocCacheStage, ByocCacheStatus } from "@autumn/shared";
import {
	toCacheStages,
	toRemovalStages,
} from "@/internal/byoc/utils/cacheStageUtils.js";

describe("an Atom's deploy steps", () => {
	test("wait on the org until its stack goes in", () => {
		expect(
			toCacheStages({ doneStages: [], status: ByocCacheStatus.AwaitingSetup }),
		).toEqual({
			stack: "waiting",
			disk: "waiting",
			machine: "waiting",
			load_balancer: "waiting",
			atom: "waiting",
			connected: "waiting",
		});
	});

	test("run the step after the furthest one done, and count every earlier one done", () => {
		// alien reports the machine before the volume; the table still only moves forward.
		expect(
			toCacheStages({
				doneStages: [ByocCacheStage.Stack, ByocCacheStage.Machine],
				status: ByocCacheStatus.Provisioning,
			}),
		).toEqual({
			stack: "done",
			disk: "done",
			machine: "done",
			load_balancer: "running",
			atom: "waiting",
			connected: "waiting",
		});
	});

	test("fail at the step after the furthest one done", () => {
		expect(
			toCacheStages({
				doneStages: [ByocCacheStage.Stack, ByocCacheStage.Disk],
				status: ByocCacheStatus.Failed,
			}).machine,
		).toBe("failed");
	});

	test("wait on Autumn reaching a running Atom before it is connected", () => {
		const running = toCacheStages({
			doneStages: [ByocCacheStage.Atom],
			status: ByocCacheStatus.Ready,
		});
		expect(running.atom).toBe("done");
		expect(running.connected).toBe("running");

		const connected = toCacheStages({
			doneStages: [ByocCacheStage.Atom, ByocCacheStage.Connected],
			status: ByocCacheStatus.Ready,
		});
		expect(connected.connected).toBe("done");
	});
});

describe("an Atom's removal steps", () => {
	test("what is taken down is done and the rest is under way", () => {
		const stages = toRemovalStages({
			removedStages: [ByocCacheStage.Atom, ByocCacheStage.Machine],
			hasFailed: false,
		});
		expect(stages.atom).toBe("done");
		expect(stages.machine).toBe("done");
		expect(stages.load_balancer).toBe("running");
		expect(stages.disk).toBe("running");
	});

	test("a failed delete stops at the first step still standing", () => {
		const stages = toRemovalStages({
			removedStages: [ByocCacheStage.Atom],
			hasFailed: true,
		});
		expect(stages.machine).toBe("failed");
		expect(stages.load_balancer).toBe("waiting");
		expect(stages.disk).toBe("waiting");
	});
});
