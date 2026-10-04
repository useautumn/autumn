import {
	type DeductionContext,
	type DeductionDelta,
	type DeductionRow,
	reserveDeductionContext,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { TrackGrant } from "@autumn/balance-worker-client/protocol";
import type {
	SubjectDecisionCounters,
	SubjectDecisions,
} from "./types/subjectDecisions.js";

/** The longest a server answers tracks from one grant. */
export const TRACK_GRANT_TTL_MS = 1_000;
/** How long past its ttl a grant's unspent units stay reserved: the server's append deadline plus queue lag. */
export const TRACK_GRANT_HOLD_MS = 5_000;
/** A grant leaves `1/s` of the headroom for every lane together, so sync tracks keep the rest. */
export const TRACK_GRANT_SAFETY = 4;
export const TRACK_GRANT_MAX_UNITS = 100;
/** A lane counts toward F while it has sent a track for the key within this window. */
const LANE_WINDOW_MS = 1_000;
/** Keys with grants or lanes tracked; the least recently used one is forgotten first. */
const MAX_TRACKED_KEYS = 20_000;

type OutstandingGrant = { remaining: number; holdUntil: number };

type KeyGrants = {
	lanes: Map<string, number>;
	grants: Map<string, OutstandingGrant>;
};

type GrantCounters = Pick<
	SubjectDecisionCounters,
	| "trackGrantsIssued"
	| "trackGrantsWithheld"
	| "trackGrantedApplied"
	| "trackGrantedLate"
>;

const isPlainRow = ({
	row,
	featureId,
}: {
	row: DeductionRow;
	featureId: string;
}): boolean =>
	row.featureId === featureId &&
	row.entityKey === null &&
	row.creditCost === 1 &&
	row.rateCard === null &&
	!row.unlimited &&
	!row.usageAllowed &&
	!row.freeAllocated;

/** Only balances that stop at zero with nothing else gating them: there a grant's units are exactly what a sync track can't take. */
export const isGrantableContext = ({
	context,
	featureId,
}: {
	context: DeductionContext;
	featureId: string;
}): boolean =>
	context.entityId === null &&
	context.rows.length > 0 &&
	context.usageWindowLimits.length === 0 &&
	context.allocationGates.size === 0 &&
	!context.readsProperties &&
	!context.overdueBlocked &&
	context.rows.every((row) => isPlainRow({ row, featureId })) &&
	context.rolloverRows.every((row) => isPlainRow({ row, featureId }));

/** Refunds, locks, entities, properties, deducting checks and queued claims always go to the owner. */
export const isGrantableTrack = ({
	command,
}: {
	command: TrackCommand;
}): boolean =>
	command.value > 0 &&
	command.lock === undefined &&
	command.idempotency === undefined &&
	command.enforceOverdueBlock === undefined &&
	command.leaseId === undefined &&
	!command.identity.entityId &&
	(command.properties === null || Object.keys(command.properties).length === 0);

const headroomOf = ({
	context,
	deltas,
}: {
	context: DeductionContext;
	deltas: DeductionDelta[];
}): number => {
	let headroom = 0;
	for (const row of [...context.rows, ...context.rolloverRows])
		headroom += Math.max(0, row.balance);
	for (const delta of deltas) headroom += delta.balanceDelta;
	return headroom;
};

/**
 * Escrow for tracks answered at the servers: each grant's unspent units are reserved against every other decision on
 * the key until its hold lapses, and all grants together never exceed `1/s` of the headroom left when the last was given.
 */
export const createTrackGrants = ({
	counters,
}: {
	counters: GrantCounters;
}): Pick<SubjectDecisions, "reserveTrackGrants" | "grantTrack"> => {
	const byKey = new Map<string, KeyGrants>();
	const leasePrefix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
	let issued = 0;
	// A new owner never saw its predecessor's grants: it grants nothing until they have lapsed.
	let grantingFrom: number | null = null;

	function keyOf({
		customerKey,
		command,
	}: {
		customerKey: string;
		command: TrackCommand;
	}): string {
		return `${customerKey}\u0000${command.featureId}`;
	}

	function observe({ at }: { at: number }): void {
		grantingFrom ??= at + TRACK_GRANT_TTL_MS + TRACK_GRANT_HOLD_MS;
	}

	function outstandingOf({
		entry,
		at,
	}: {
		entry: KeyGrants;
		at: number;
	}): number {
		let outstanding = 0;
		for (const [leaseId, grant] of entry.grants) {
			if (grant.holdUntil <= at || grant.remaining <= 0) {
				entry.grants.delete(leaseId);
				continue;
			}
			outstanding += grant.remaining;
		}
		return outstanding;
	}

	function touch({ key, entry }: { key: string; entry: KeyGrants }): void {
		byKey.delete(key);
		byKey.set(key, entry);
		if (byKey.size <= MAX_TRACKED_KEYS) return;
		const oldest = byKey.keys().next().value;
		if (oldest !== undefined) byKey.delete(oldest);
	}

	function reserveTrackGrants({
		customerKey,
		command,
		context,
	}: {
		customerKey: string;
		command: TrackCommand;
		context: DeductionContext;
	}): DeductionContext {
		const at = command.occurredAt;
		observe({ at });
		const entry = byKey.get(keyOf({ customerKey, command }));
		if (command.leaseId !== undefined) {
			const grant = entry?.grants.get(command.leaseId);
			if (grant) {
				counters.trackGrantedApplied++;
				grant.remaining = Math.max(0, grant.remaining - command.value);
			} else counters.trackGrantedLate++;
		}
		if (!entry) return context;
		const reserved = outstandingOf({ entry, at });
		return reserveDeductionContext({ context, reserved });
	}

	function grantTrack({
		customerKey,
		command,
		context,
		deltas,
		lane,
	}: {
		customerKey: string;
		command: TrackCommand;
		context: DeductionContext;
		deltas: DeductionDelta[];
		lane: string;
	}): TrackGrant | null {
		const at = command.occurredAt;
		observe({ at });
		const key = keyOf({ customerKey, command });
		const entry = byKey.get(key) ?? { lanes: new Map(), grants: new Map() };
		entry.lanes.set(lane, at);
		for (const [seen, seenAt] of entry.lanes)
			if (seenAt <= at - LANE_WINDOW_MS) entry.lanes.delete(seen);
		touch({ key, entry });

		const grantable =
			grantingFrom !== null &&
			at >= grantingFrom &&
			isGrantableTrack({ command }) &&
			isGrantableContext({ context, featureId: command.featureId });
		if (!grantable) {
			counters.trackGrantsWithheld++;
			return null;
		}
		const headroom = headroomOf({ context, deltas });
		const lanes = entry.lanes.size;
		const units = Math.min(
			Math.floor(headroom / (TRACK_GRANT_SAFETY * lanes)),
			TRACK_GRANT_MAX_UNITS,
			Math.floor(headroom / TRACK_GRANT_SAFETY) - outstandingOf({ entry, at }),
		);
		if (units < 1) {
			counters.trackGrantsWithheld++;
			return null;
		}
		issued++;
		const leaseId = `${leasePrefix}.${issued.toString(36)}`;
		const expiresAt = at + TRACK_GRANT_TTL_MS;
		entry.grants.set(leaseId, {
			remaining: units,
			holdUntil: expiresAt + TRACK_GRANT_HOLD_MS,
		});
		counters.trackGrantsIssued++;
		return { leaseId, units, expiresAt };
	}

	return { reserveTrackGrants, grantTrack };
};
