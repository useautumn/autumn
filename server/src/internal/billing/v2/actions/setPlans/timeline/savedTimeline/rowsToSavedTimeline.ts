import { sortByStart } from "../timelineGuards";
import type { SavedTimeline } from "../types/timeline";
import type { TimelineRow } from "../types/timelineRow";
import type { SavedRow, SavedSegment } from "../types/timelineSegment";

export const instanceGroupKey = ({
	planId,
	internalEntityId,
}: {
	planId: string;
	internalEntityId: string | null;
}) => `${planId}|${internalEntityId ?? "customer"}`;

export const instanceKey = ({
	planId,
	internalEntityId,
	slot,
}: {
	planId: string;
	internalEntityId: string | null;
	slot: number;
}) => `${instanceGroupKey({ planId, internalEntityId })}|${slot}`;

const isRelevantRow = ({ row, now }: { row: TimelineRow; now: number }) =>
	row.endsAt === null || row.endsAt > now;

/** A row continues the slot it starts exactly where, preferring the same subscription id. */
const findSlotIndex = ({
	slots,
	row,
}: {
	slots: TimelineRow[][];
	row: TimelineRow;
}) => {
	const lastRow = (slot: TimelineRow[]) => slot[slot.length - 1];
	const continues = (slot: TimelineRow[]) =>
		lastRow(slot)?.endsAt === row.startsAt;
	const isFree = (slot: TimelineRow[]) => {
		const endsAt = lastRow(slot)?.endsAt;
		return endsAt !== null && endsAt !== undefined && endsAt <= row.startsAt;
	};

	const sameExternalContinuation = slots.findIndex(
		(slot) => continues(slot) && lastRow(slot)?.externalId === row.externalId,
	);
	if (sameExternalContinuation >= 0) return sameExternalContinuation;

	const continuation = slots.findIndex(continues);
	if (continuation >= 0) return continuation;

	return slots.findIndex(isFree);
};

const assignSlots = (rows: TimelineRow[]): TimelineRow[][] => {
	const slots: TimelineRow[][] = [];
	for (const row of sortByStart(rows)) {
		const slotIndex = findSlotIndex({ slots, row });
		if (slotIndex >= 0) slots[slotIndex]?.push(row);
		else slots.push([row]);
	}
	return slots;
};

const toSavedRow = (row: TimelineRow): SavedRow => ({
	customerProductId: row.customerProductId,
	startsAt: row.startsAt,
	endsAt: row.endsAt,
	periodEndsAtAfterReset: row.periodEndsAtAfterReset,
	scheduled: row.scheduled,
	canceling: row.canceling,
	pastDue: row.pastDue,
	unbilledByStripe: row.unbilledByStripe,
});

const toSavedSegment = ({
	key,
	rows,
}: {
	key: string;
	rows: TimelineRow[];
}): SavedSegment => {
	const [firstRow] = rows as [TimelineRow, ...TimelineRow[]];
	const lastRow = rows[rows.length - 1] ?? firstRow;
	return {
		key,
		planId: firstRow.planId,
		internalEntityId: firstRow.internalEntityId,
		replacementKey: firstRow.replacementKey,
		configHash: firstRow.configHash,
		lifetime: firstRow.lifetime,
		onLiveSubscription: rows.some((row) => row.onLiveSubscription),
		startsAt: firstRow.startsAt,
		endsAt: lastRow.endsAt,
		rows: rows.map(toSavedRow),
	};
};

/** Contiguous rows granting the same config are one segment, however many phases wrote them. */
const slotToSegments = ({
	key,
	rows,
}: {
	key: string;
	rows: TimelineRow[];
}): SavedSegment[] => {
	const runs: TimelineRow[][] = [];
	for (const row of rows) {
		const currentRun = runs[runs.length - 1];
		const previousRow = currentRun?.[currentRun.length - 1];
		const extendsRun =
			previousRow !== undefined &&
			previousRow.endsAt === row.startsAt &&
			previousRow.configHash === row.configHash;
		if (currentRun && extendsRun) currentRun.push(row);
		else runs.push([row]);
	}
	return runs.map((run) => toSavedSegment({ key, rows: run }));
};

/** The saved timeline the rows run from now on: one key per plan instance, merged runs per key. */
export const rowsToSavedTimeline = ({
	rows,
	now,
}: {
	rows: TimelineRow[];
	now: number;
}): SavedTimeline => {
	const groups = new Map<string, TimelineRow[]>();
	for (const row of rows.filter((row) => isRelevantRow({ row, now }))) {
		const groupKey = instanceGroupKey(row);
		groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
	}

	const segments = [...groups.values()].flatMap((groupRows) =>
		assignSlots(groupRows).flatMap((slotRows, slot) => {
			const [firstRow] = slotRows;
			if (!firstRow) return [];
			return slotToSegments({
				key: instanceKey({ ...firstRow, slot }),
				rows: slotRows,
			});
		}),
	);

	return { segments };
};
