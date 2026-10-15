/**
 * The two-owner detector and the per-window roll bars, from the stub's hand-ins (every journaled decision, with the
 * writer that minted it and when) and the roll's marks. Bench only; never merged.
 */
import type { OwnerClass, RollCounts } from "./rigShared.js";

/** One hand-in as the stub saw it: customer, writer, seq, appendedAt (the deciding replica's clock). */
export type HandIn = [
	customerId: string,
	writerId: string,
	seq: number,
	appendedAt: number,
];

export type Mark = { name: string; at: number; second: number };

/** A swap window: from the swap's SIGTERM to its `/health` 200 + 15 s; the join is legal only after the restart. */
export type SwapWindow = {
	replica: OwnerClass;
	from: number;
	to: number;
	startedAt: number | null;
};

const WINDOW_TAIL_MS = 15_000;

export const swapWindowsOf = ({ marks }: { marks: Mark[] }): SwapWindow[] =>
	(["a", "b"] as const).flatMap((replica) => {
		const sigterm = marks.find((m) => m.name === `${replica} sigterm`);
		const ready = marks.find((m) => m.name === `${replica} ready`);
		if (!sigterm || !ready) return [];
		const started = marks.find((m) => m.name === `${replica} started`);
		return [
			{
				replica,
				from: sigterm.at,
				to: ready.at + WINDOW_TAIL_MS,
				startedAt: started?.at ?? null,
			},
		];
	});

type Switch = {
	customerId: string;
	/** The switch happened between the old owner's last decision and the new owner's first. */
	prevAt: number;
	at: number;
	from: string;
	to: string;
	fromWriter: string;
	toWriter: string;
};

/**
 * Per customer: duplicates (writer, seq) dropped, sorted by appendedAt; a change of deciding replica is a switch, placed
 * between the two decisions. In a swap of X (peer Y) the legal moves are one X→Y then one Y→X decided after X restarted;
 * any other switch overlapping a window, or a switch overlapping none, is a two-owner event.
 */
export const detectTwoOwner = ({
	handIns,
	replicaOfWriter,
	windows,
}: {
	handIns: HandIn[];
	replicaOfWriter: Record<string, OwnerClass>;
	windows: SwapWindow[];
}) => {
	const byCustomer = new Map<string, Map<string, HandIn>>();
	for (const handIn of handIns) {
		const [customerId, writerId, seq] = handIn;
		const held = byCustomer.get(customerId) ?? new Map<string, HandIn>();
		if (!held.has(`${writerId}/${seq}`)) held.set(`${writerId}/${seq}`, handIn);
		byCustomer.set(customerId, held);
	}
	const replicaOf = (writerId: string) =>
		replicaOfWriter[writerId] ?? `?${writerId.slice(0, 8)}`;
	const perWindow = windows.map((window) => ({
		replica: window.replica,
		from: window.from,
		to: window.to,
		switches: 0,
		legal: 0,
		events: 0,
		customers: new Set<string>(),
	}));
	const outside = { events: 0, customers: new Set<string>() };
	const samples: (Switch & { window: string | null })[] = [];
	let decisions = 0;
	for (const [customerId, held] of byCustomer) {
		const sorted = [...held.values()].sort(
			(x, y) => x[3] - y[3] || (x[1] === y[1] ? x[2] - y[2] : 0),
		);
		decisions += sorted.length;
		// Per window, which legal move this customer may still make: 0 = the leave, 1 = the join, 2 = none.
		const expect = windows.map(() => 0);
		for (let i = 1; i < sorted.length; i++) {
			const [, fromWriter, , prevAt] = sorted[i - 1] as HandIn;
			const [, toWriter, , at] = sorted[i] as HandIn;
			const from = replicaOf(fromWriter);
			const to = replicaOf(toWriter);
			if (from === to) continue;
			const sw = { customerId, prevAt, at, from, to, fromWriter, toWriter };
			const inside = windows
				.map((window, index) => ({ window, index }))
				.filter(({ window }) => prevAt <= window.to && at >= window.from);
			if (inside.length === 0) {
				outside.events++;
				outside.customers.add(customerId);
				if (samples.length < 40) samples.push({ ...sw, window: null });
				continue;
			}
			for (const { index } of inside)
				(perWindow[index] as { switches: number }).switches++;
			const legal = inside.find(({ window, index }) => {
				const peer = window.replica === "a" ? "b" : "a";
				if (expect[index] === 0 && from === window.replica && to === peer) {
					expect[index] = 1;
					return true;
				}
				const joinable =
					(expect[index] ?? 2) <= 1 &&
					from === peer &&
					to === window.replica &&
					window.startedAt !== null &&
					at >= window.startedAt;
				if (joinable) expect[index] = 2;
				return joinable;
			});
			if (legal) {
				(perWindow[legal.index] as { legal: number }).legal++;
				continue;
			}
			const first = perWindow[
				(inside[0] as { index: number }).index
			] as (typeof perWindow)[number];
			first.events++;
			first.customers.add(customerId);
			if (samples.length < 40)
				samples.push({ ...sw, window: `${first.replica} swap` });
		}
	}
	const customers = new Set([
		...outside.customers,
		...perWindow.flatMap((window) => [...window.customers]),
	]);
	return {
		events: outside.events + perWindow.reduce((sum, w) => sum + w.events, 0),
		customers: customers.size,
		decisions,
		handIns: handIns.length,
		unknownWriters: [
			...new Set(
				handIns
					.map(([, writerId]) => writerId)
					.filter((writerId) => !replicaOfWriter[writerId]),
			),
		],
		outside: { events: outside.events, customers: outside.customers.size },
		perWindow: perWindow.map(({ customers: held, ...window }) => ({
			...window,
			customers: held.size,
		})),
		samples,
	};
};

type HealthLine = {
	second: number;
	replica: OwnerClass;
	health: { threads?: { handoffLate?: number }[] };
};

/** Per window: requests sent, owner_unavailable forwards, and handoffLate from each replica's /health counter deltas. */
export const windowBarsOf = ({
	windows,
	seconds,
	health,
	startAt,
}: {
	windows: SwapWindow[];
	seconds: { second: number; a: RollCounts; b: RollCounts }[];
	health: HealthLine[];
	startAt: number;
}) => {
	const secondOf = (at: number) => (at - startAt) / 1000;
	// A /health counter restarts with its process: a drop is a reset, and the new value is all increment.
	const increments: { second: number; replica: OwnerClass; late: number }[] =
		[];
	for (const replica of ["a", "b"] as const) {
		let last: number | null = null;
		for (const line of health.filter((h) => h.replica === replica)) {
			const threads = line.health.threads;
			if (!threads) continue;
			const late = threads.reduce((sum, t) => sum + (t.handoffLate ?? 0), 0);
			const delta = last === null ? 0 : late >= last ? late - last : late;
			last = late;
			if (delta > 0)
				increments.push({ second: line.second, replica, late: delta });
		}
	}
	return windows.map((window) => {
		const from = secondOf(window.from);
		const to = secondOf(window.to);
		const inside = seconds.filter(
			(s) => s.second >= Math.floor(from) && s.second < Math.ceil(to),
		);
		const requests = inside.reduce((sum, s) => sum + s.a.sent + s.b.sent, 0);
		const ownerUnavailable = inside.reduce(
			(sum, s) =>
				sum +
				(s.a.forwardReasons.owner_unavailable ?? 0) +
				(s.b.forwardReasons.owner_unavailable ?? 0),
			0,
		);
		const forwarded = inside.reduce(
			(sum, s) => sum + s.a.forwarded + s.b.forwarded,
			0,
		);
		// A replay answered 409 is the key working, not a failure; a replay allowed twice stays in.
		const failedOf = (counts: RollCounts) =>
			Object.entries(counts.failedStatus)
				.filter(
					([status]) =>
						!status.startsWith("replay ") ||
						status.startsWith("replay allowed"),
				)
				.reduce((x, [, n]) => x + n, 0);
		const failed = inside.reduce(
			(sum, s) => sum + failedOf(s.a) + failedOf(s.b),
			0,
		);
		// Polls are 2 s apart: a poll up to 2 s after the window closes still counts what happened inside it.
		const late = increments.filter(
			(i) => i.second > from && i.second <= to + 2,
		);
		const handoffLate = late.reduce((sum, i) => sum + i.late, 0);
		return {
			replica: window.replica,
			fromSecond: Number(from.toFixed(1)),
			toSecond: Number(to.toFixed(1)),
			requests,
			forwarded,
			ownerUnavailable,
			failed,
			handoffLate,
			handoffLateByReplica: {
				a: late
					.filter((i) => i.replica === "a")
					.reduce((s, i) => s + i.late, 0),
				b: late
					.filter((i) => i.replica === "b")
					.reduce((s, i) => s + i.late, 0),
			},
			handoffLatePercent: requests
				? Number(((100 * handoffLate) / requests).toFixed(3))
				: 0,
		};
	});
};

/** Per swap: SIGTERM → exit, exit → /health 200, and the restart's own start → /health 200. */
export const swapDurationsOf = ({ marks }: { marks: Mark[] }) =>
	(["a", "b"] as const).flatMap((replica) => {
		const at = (name: string) =>
			marks.find((m) => m.name === `${replica} ${name}`)?.at;
		const sigterm = at("sigterm");
		const exited = at("exited");
		const started = at("started");
		const ready = at("ready");
		if (sigterm === undefined) return [];
		return [
			{
				replica,
				sigtermToExitMs: exited !== undefined ? exited - sigterm : null,
				exitToReadyMs:
					exited !== undefined && ready !== undefined ? ready - exited : null,
				startToReadyMs:
					started !== undefined && ready !== undefined ? ready - started : null,
			},
		];
	});
