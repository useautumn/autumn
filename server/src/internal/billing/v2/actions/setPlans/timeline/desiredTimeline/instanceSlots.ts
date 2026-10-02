import type { GrantedLicense } from "../instanceConfig/types/instanceConfig";
import { instanceGroupKey } from "../savedTimeline/rowsToSavedTimeline";
import { isAliveAt } from "../timelineGuards";
import type { SavedTimeline } from "../types/timeline";
import type { TimelineRow } from "../types/timelineRow";
import type { DesiredSegment } from "../types/timelineSegment";

/** What one instance slot holds, saved and so far requested, when placing the next plan. */
export type InstanceSlot = {
	slot: number;
	externalIds: Set<string>;
	savedLive?: {
		configHash: string;
		lifetime: boolean;
		grantedLicenses: GrantedLicense[];
	};
	savedStarts: number[];
	desired: DesiredSegment[];
};

export const instanceKeySlot = (key: string) =>
	Number(key.slice(key.lastIndexOf("|") + 1));

/** Every saved slot per plan and scope, with what it runs now. */
export const savedInstanceSlots = ({
	saved,
	rows,
	grantedLicensesById,
	now,
}: {
	saved: SavedTimeline;
	rows: TimelineRow[];
	grantedLicensesById: Map<string, GrantedLicense[]>;
	now: number;
}): Map<string, InstanceSlot[]> => {
	const rowsById = new Map(rows.map((row) => [row.customerProductId, row]));
	const slotsByGroup = new Map<string, InstanceSlot[]>();

	for (const segment of saved.segments) {
		const groupKey = instanceGroupKey(segment);
		const slots = slotsByGroup.get(groupKey) ?? [];
		slotsByGroup.set(groupKey, slots);

		const slotIndex = instanceKeySlot(segment.key);
		let slot = slots.find((candidate) => candidate.slot === slotIndex);
		if (!slot) {
			slot = {
				slot: slotIndex,
				externalIds: new Set(),
				savedStarts: [],
				desired: [],
			};
			slots.push(slot);
		}

		slot.savedStarts.push(segment.startsAt);
		for (const { customerProductId } of segment.rows) {
			const externalId = rowsById.get(customerProductId)?.externalId;
			if (externalId) slot.externalIds.add(externalId);
		}

		const [liveRow] = segment.rows;
		if (liveRow && isAliveAt({ segment, at: now }) && segment.startsAt <= now) {
			slot.savedLive = {
				configHash: segment.configHash,
				lifetime: segment.lifetime,
				grantedLicenses:
					grantedLicensesById.get(liveRow.customerProductId) ?? [],
			};
		}
	}

	return slotsByGroup;
};
