/**
 * Reads a run's health.jsonl: per replica, the busiest thread in each interval (the hot customer's owner), its busy
 * share, heap and each stage's share of its busy time. `bun run rig:report <runDir>`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

// A roll run has its own report; the boxes always call rig:report.
if (existsSync(join(process.argv[2] ?? "", "roll.jsonl"))) {
	await import("./rigRollReport.js");
	process.exit(0);
}

type Poll = {
	elapsedS: number;
	step: number;
	replica: string;
	health: { threads?: Record<string, number>[] };
};

const runDir = process.argv[2];
if (!runDir) throw new Error("Usage: rig:report <runDir>");
const polls: Poll[] = (await Bun.file(join(runDir, "health.jsonl")).text())
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));

const stageFields = (thread: Record<string, number>) =>
	Object.keys(thread).filter(
		(key) => key.startsWith("stage") && key !== "stageIdleUs",
	);

const previous = new Map<string, Poll>();
for (const poll of polls) {
	const before = previous.get(poll.replica);
	previous.set(poll.replica, poll);
	if (!before?.health.threads || !poll.health.threads) continue;
	const wallUs = (poll.elapsedS - before.elapsedS) * 1_000_000;
	const intervals = poll.health.threads.map((thread, i) => {
		const was = before.health.threads?.[i] ?? {};
		const stages = Object.fromEntries(
			stageFields(thread).map((key) => [
				key,
				(thread[key] ?? 0) - (was[key] ?? 0),
			]),
		);
		const busyUs = Object.values(stages).reduce((sum, us) => sum + us, 0);
		return {
			thread: i,
			busyUs,
			stages,
			heapMb: Math.round((thread.heapBytes ?? 0) / 1024 ** 2),
		};
	});
	const busiest = intervals.reduce((top, next) =>
		next.busyUs > top.busyUs ? next : top,
	);
	const shares = Object.fromEntries(
		Object.entries(busiest.stages)
			.filter(([, us]) => us > 0)
			.sort(([, a], [, b]) => b - a)
			.map(([key, us]) => [
				key.replace(/^stage|Us$/g, ""),
				Number((us / Math.max(1, busiest.busyUs)).toFixed(3)),
			]),
	);
	console.log(
		JSON.stringify({
			step: poll.step,
			replica: poll.replica,
			thread: busiest.thread,
			busyShare: Number((busiest.busyUs / wallUs).toFixed(3)),
			heapMb: busiest.heapMb,
			threadsBusy: intervals.map(({ busyUs }) =>
				Number((busyUs / wallUs).toFixed(2)),
			),
			shares,
		}),
	);
}
