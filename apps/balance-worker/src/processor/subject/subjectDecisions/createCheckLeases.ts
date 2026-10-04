import {
	type CheckCommand,
	type CheckResult,
	computeCheck,
	type DeductionContext,
	deductionContextToExpiresAt,
	type RowChange,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import type { CheckLease } from "@autumn/balance-worker-client/protocol";
import type {
	SubjectDecisionCounters,
	SubjectDecisions,
} from "./types/subjectDecisions.js";

/** The longest a server answers a check from its lease: P2's one-second contract, one hop out. */
export const CHECK_LEASE_TTL_MS = 1_000;
/** A lease needs this many times the draw its rows saw over the ttl still fundable after the check. */
const HEADROOM_FACTOR = 10;
/** Time constant of the per-row draw rate: a burst a second ago still counts about a third. */
const DRAW_RATE_TAU_MS = 1_000;
/** Rows whose draw rate is tracked; the least recently drawn one is forgotten first. */
const MAX_TRACKED_ROWS = 20_000;
/** A new owner has seen no draws yet: until it has watched this long, only a check no draw can refuse is leased. */
const RATE_WARMUP_MS = 2 * DRAW_RATE_TAU_MS;

type DrawRate = { perMs: number; at: number };

type LeaseCounters = Pick<
	SubjectDecisionCounters,
	"checkLeasesIssued" | "checkLeasesWithheld"
>;

/** Leases a check answer to the servers only while nothing a second of tracks can do would change it. */
export const createCheckLeases = ({
	counters,
}: {
	counters: LeaseCounters;
}): Pick<SubjectDecisions, "recordDraws" | "leaseCheck"> => {
	const drawRates = new Map<string, DrawRate>();
	let observingSince: number | null = null;

	function decayedPerMs({ rate, at }: { rate: DrawRate; at: number }): number {
		const elapsed = Math.max(0, at - rate.at);
		return rate.perMs * Math.exp(-elapsed / DRAW_RATE_TAU_MS);
	}

	function recordDraw({
		rowId,
		units,
		at,
	}: {
		rowId: string;
		units: number;
		at: number;
	}): void {
		const known = drawRates.get(rowId);
		const perMs =
			(known ? decayedPerMs({ rate: known, at }) : 0) +
			units / DRAW_RATE_TAU_MS;
		// Re-inserting keeps the map in last-drawn order, so the oldest row is first to go.
		drawRates.delete(rowId);
		drawRates.set(rowId, { perMs, at: Math.max(at, known?.at ?? at) });
		if (drawRates.size <= MAX_TRACKED_ROWS) return;
		const oldest = drawRates.keys().next().value;
		if (oldest !== undefined) drawRates.delete(oldest);
	}

	function recordDraws({
		changes,
		at,
	}: {
		changes: RowChange[];
		at: number;
	}): void {
		for (const change of changes) {
			if (change.op !== "increment") continue;
			if (
				change.table !== "customerEntitlements" &&
				change.table !== "rollovers"
			)
				continue;
			let units = Math.max(0, -(change.add.balance ?? 0));
			for (const entry of Object.values(change.addEntries?.entities ?? {}))
				units += Math.max(0, -(entry.balance ?? 0));
			if (units > 0) recordDraw({ rowId: change.id, units, at });
		}
	}

	/** Units of the checked feature the context's rows lose per ms; null when a rate card makes credits non-linear. */
	function drawPerMsOf({
		context,
		at,
	}: {
		context: DeductionContext;
		at: number;
	}): number | null {
		const seen = new Set<string>();
		let perMs = 0;
		for (const row of [...context.rows, ...context.rolloverRows]) {
			if (row.rateCard !== null) return null;
			if (seen.has(row.id)) continue;
			seen.add(row.id);
			const rate = drawRates.get(row.id);
			if (!rate || row.creditCost <= 0) continue;
			perMs += decayedPerMs({ rate, at }) / row.creditCost;
		}
		return perMs;
	}

	/** The first moment the selection's rows change by the clock: a grant or rollover expires, or a reset falls due. */
	function rowsChangeAt({ context }: { context: DeductionContext }): number {
		let changeAt = deductionContextToExpiresAt({ context });
		for (const row of context.customerEntitlements) {
			if (
				row.next_reset_at !== null &&
				row.next_reset_at > context.selection.now
			)
				changeAt = Math.min(changeAt, row.next_reset_at);
		}
		return changeAt;
	}

	function decideLease({
		fullSubject,
		command,
		context,
		result,
	}: {
		fullSubject: WorkerFullSubject;
		command: CheckCommand;
		context: DeductionContext;
		result: CheckResult;
	}): CheckLease | null {
		// Phase 1 never leases a refusal: a refund, top-up or reset could open it inside the ttl.
		if (!result.allowed || command.properties !== null) return null;
		if (
			context.usageWindowLimits.length > 0 ||
			context.allocationGates.size > 0
		)
			return null;
		const now = command.occurredAt;
		const ttlMs = Math.min(CHECK_LEASE_TTL_MS, rowsChangeAt({ context }) - now);
		if (ttlMs <= 0) return null;
		const lease = { expiresAt: now + ttlMs };
		if (result.isFlag) return lease;
		observingSince ??= now;
		const drawPerMs = drawPerMsOf({ context, at: now });
		if (drawPerMs === null) return null;
		const warm = now - observingSince >= RATE_WARMUP_MS;
		if (warm && drawPerMs === 0) return lease;
		const margin = warm
			? Math.ceil(HEADROOM_FACTOR * drawPerMs * ttlMs)
			: Number.MAX_SAFE_INTEGER;
		// The same dry run with the margin on top: unlimited and overage rows pass it, a balance near its limit does not.
		const stressed = computeCheck({
			fullSubject,
			command: {
				...command,
				requiredBalance: command.requiredBalance + margin,
			},
			context,
		});
		return stressed.allowed ? lease : null;
	}

	function leaseCheck(params: {
		fullSubject: WorkerFullSubject;
		command: CheckCommand;
		context: DeductionContext;
		result: CheckResult;
	}): CheckLease | null {
		const lease = decideLease(params);
		if (lease) counters.checkLeasesIssued++;
		else counters.checkLeasesWithheld++;
		return lease;
	}

	return { recordDraws, leaseCheck };
};
