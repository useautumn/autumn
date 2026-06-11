/**
 * Differential sweep: OLD (origin/main) getCycleStart/getCycleEnd vs NEW
 * (bracket walk), both checked against an independent reference = the unique
 * lattice boundary pair bracketing `now` (unique because add(anchor, k) is
 * strictly increasing in k for every interval type).
 *
 * Verdict criteria:
 *  - newDeviations MUST be 0 (new always matches the ground truth)
 *  - every divergence between old and new MUST be an input where old != ref
 *    (i.e. the fix only changes outputs that were provably wrong)
 */

import { UTCDate } from "@date-fns/utc";
import {
	addDays,
	addHours,
	addMonths,
	addWeeks,
	addYears,
	differenceInDays,
	differenceInHours,
	differenceInMonths,
	differenceInWeeks,
	differenceInYears,
} from "date-fns";
import {
	BillingInterval,
	EntInterval,
	getCycleEnd,
	getCycleStart,
} from "@autumn/shared";

type Fns = {
	add: (d: Date, n: number) => Date;
	diff: (l: Date, e: Date) => number;
};

const FNS: Record<string, Fns> = {
	hour: { add: addHours, diff: differenceInHours },
	day: { add: addDays, diff: differenceInDays },
	week: { add: addWeeks, diff: differenceInWeeks },
	month: { add: addMonths, diff: differenceInMonths },
	quarter: {
		add: (d, n) => addMonths(d, n * 3),
		diff: (l, e) => Math.floor(differenceInMonths(l, e) / 3),
	},
	semi_annual: {
		add: (d, n) => addMonths(d, n * 6),
		diff: (l, e) => Math.floor(differenceInMonths(l, e) / 6),
	},
	year: { add: addYears, diff: differenceInYears },
};

const INTERVAL_ENUM: Record<string, BillingInterval | EntInterval> = {
	hour: EntInterval.Hour,
	day: EntInterval.Day,
	week: BillingInterval.Week,
	month: BillingInterval.Month,
	quarter: BillingInterval.Quarter,
	semi_annual: BillingInterval.SemiAnnual,
	year: BillingInterval.Year,
};

// --- OLD implementations, verbatim logic from origin/main ---
const oldStart = (fns: Fns, anchor: number, c: number, now: number) => {
	const a = new UTCDate(anchor);
	const k = Math.floor(fns.diff(new UTCDate(now), a) / c);
	const cycleStart = fns.add(a, k * c);
	if (cycleStart.getTime() > now) return fns.add(a, (k - 1) * c).getTime();
	return cycleStart.getTime();
};

const oldEnd = (fns: Fns, anchor: number, c: number, now: number) => {
	const a = new UTCDate(anchor);
	const k = Math.floor(fns.diff(new UTCDate(now), a) / c);
	const candidate = fns.add(a, k * c);
	if (candidate.getTime() > now) return candidate.getTime();
	return fns.add(a, (k + 1) * c).getTime();
};

// --- Independent reference: walk to the unique bracketing k ---
const ref = (fns: Fns, anchor: number, c: number, now: number) => {
	const a = new UTCDate(anchor);
	let k = Math.floor(fns.diff(new UTCDate(now), a) / c);
	let guard = 0;
	while (fns.add(a, (k + 1) * c).getTime() <= now) {
		k++;
		if (++guard > 10_000) throw new Error("ref walk diverged (up)");
	}
	while (fns.add(a, k * c).getTime() > now) {
		k--;
		if (++guard > 10_000) throw new Error("ref walk diverged (down)");
	}
	const start = fns.add(a, k * c).getTime();
	const end = fns.add(a, (k + 1) * c).getTime();
	if (!(start <= now && now < end)) throw new Error("ref bracket violated");
	return { start, end };
};

const fmt = (ms: number) =>
	new UTCDate(ms).toISOString().replace("T", " ").slice(0, 16);

type Config = {
	name: string;
	interval: string;
	c: number;
	anchors: number[];
	sweepStart: number;
	sweepEnd: number;
	stepMs: number;
};

const d = (
	y: number,
	mo: number,
	day: number,
	h = 10,
	mi = 0,
): number => new UTCDate(y, mo - 1, day, h, mi, 0).getTime();

const HOUR = 3_600_000;
const jan2025Days = (days: number[]) => days.map((dd) => d(2025, 1, dd));
const ALL_JAN_DAYS = jan2025Days(
	Array.from({ length: 31 }, (_, index) => index + 1),
);
const EOM_ANCHORS = jan2025Days([2, 15, 28, 29, 30, 31]);

const configs: Config[] = [
	{ name: "month c=1 (all 31 anchor days, incl. future-anchor region)", interval: "month", c: 1, anchors: ALL_JAN_DAYS, sweepStart: d(2024, 7, 1), sweepEnd: d(2026, 7, 1), stepMs: 6 * HOUR },
	{ name: "month c=2", interval: "month", c: 2, anchors: EOM_ANCHORS, sweepStart: d(2024, 7, 1), sweepEnd: d(2026, 7, 1), stepMs: 6 * HOUR },
	{ name: "month c=3", interval: "month", c: 3, anchors: EOM_ANCHORS, sweepStart: d(2024, 7, 1), sweepEnd: d(2026, 7, 1), stepMs: 6 * HOUR },
	{ name: "quarter c=1", interval: "quarter", c: 1, anchors: EOM_ANCHORS, sweepStart: d(2024, 7, 1), sweepEnd: d(2026, 7, 1), stepMs: 6 * HOUR },
	{ name: "semi_annual c=1 (incl. Aug 31 anchor -> Feb 28 clamp)", interval: "semi_annual", c: 1, anchors: [...EOM_ANCHORS, d(2024, 8, 31)], sweepStart: d(2024, 1, 1), sweepEnd: d(2027, 1, 1), stepMs: 12 * HOUR },
	{ name: "year c=1 (incl. Feb 29 leap anchor)", interval: "year", c: 1, anchors: [d(2024, 2, 29, 12), d(2023, 2, 28, 12), d(2024, 12, 31), d(2025, 1, 1)], sweepStart: d(2023, 6, 1), sweepEnd: d(2027, 6, 1), stepMs: 12 * HOUR },
	{ name: "week c=1", interval: "week", c: 1, anchors: [d(2025, 1, 7, 13, 37)], sweepStart: d(2024, 11, 1), sweepEnd: d(2025, 11, 1), stepMs: 3 * HOUR },
	{ name: "day c=1", interval: "day", c: 1, anchors: [d(2025, 1, 7, 13, 37)], sweepStart: d(2024, 12, 1), sweepEnd: d(2025, 4, 1), stepMs: 1 * HOUR },
	{ name: "hour c=1", interval: "hour", c: 1, anchors: [d(2025, 1, 7, 13, 37)], sweepStart: d(2025, 1, 1), sweepEnd: d(2025, 1, 14), stepMs: 7 * 60_000 },
];

let totalCombos = 0;
let totalOldWrong = 0;
let totalNewWrong = 0;
let totalChangedWhileOldCorrect = 0;

for (const cfg of configs) {
	const fns = FNS[cfg.interval];
	const intervalEnum = INTERVAL_ENUM[cfg.interval];
	let combos = 0;
	let oldWrong = 0;
	let newWrong = 0;
	let changedWhileOldCorrect = 0;
	const samples: string[] = [];

	const checkOne = (anchor: number, now: number) => {
		combos++;
		const r = ref(fns, anchor, cfg.c, now);
		const os = oldStart(fns, anchor, cfg.c, now);
		const oe = oldEnd(fns, anchor, cfg.c, now);
		const ns = getCycleStart({ anchor, interval: intervalEnum, intervalCount: cfg.c, now });
		const ne = getCycleEnd({ anchor, interval: intervalEnum, intervalCount: cfg.c, now });

		const oldOk = os === r.start && oe === r.end;
		const newOk = ns === r.start && ne === r.end;
		if (!newOk) {
			newWrong++;
			samples.push(`NEW WRONG anchor=${fmt(anchor)} now=${fmt(now)} new=[${fmt(ns)},${fmt(ne)}) ref=[${fmt(r.start)},${fmt(r.end)})`);
		}
		if (!oldOk) {
			oldWrong++;
			if (samples.length < 4) {
				samples.push(`old wrong: anchor=${fmt(anchor)} now=${fmt(now)} old=[${fmt(os)},${fmt(oe)}) ref=[${fmt(r.start)},${fmt(r.end)})`);
			}
		}
		if (oldOk && (ns !== os || ne !== oe)) {
			changedWhileOldCorrect++;
			samples.push(`REGRESSION anchor=${fmt(anchor)} now=${fmt(now)} old=[${fmt(os)},${fmt(oe)}) new=[${fmt(ns)},${fmt(ne)})`);
		}
	};

	for (const anchor of cfg.anchors) {
		for (let now = cfg.sweepStart; now < cfg.sweepEnd; now += cfg.stepMs) {
			checkOne(anchor, now);
		}
		// exact boundary instants ±1ms for the first 24 boundaries after sweepStart
		let k = 0;
		for (;;) {
			const b = fns.add(new UTCDate(anchor), k * cfg.c).getTime();
			if (b > cfg.sweepEnd || k > 24) break;
			if (b >= cfg.sweepStart) {
				checkOne(anchor, b - 1);
				checkOne(anchor, b);
				checkOne(anchor, b + 1);
			}
			k++;
		}
	}

	totalCombos += combos;
	totalOldWrong += oldWrong;
	totalNewWrong += newWrong;
	totalChangedWhileOldCorrect += changedWhileOldCorrect;
	console.log(`${cfg.name.padEnd(58)} combos=${String(combos).padStart(7)}  old-wrong=${String(oldWrong).padStart(5)}  new-wrong=${newWrong}  changed-while-old-correct=${changedWhileOldCorrect}`);
	for (const s of samples.slice(0, 3)) console.log(`    ${s}`);
}

console.log("\n=== TOTALS ===");
console.log(`combos tested:             ${totalCombos}`);
console.log(`old deviates from truth:   ${totalOldWrong}`);
console.log(`new deviates from truth:   ${totalNewWrong}   <- must be 0`);
console.log(`new changed a correct old: ${totalChangedWhileOldCorrect}   <- must be 0`);
