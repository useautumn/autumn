import {
	isOneOffProduct,
	isProductPaidAndRecurring,
	productToReplacementKey,
} from "@autumn/shared";
import type { ConfigInterner } from "../instanceConfig/createConfigInterner";
import type { GrantedLicense } from "../instanceConfig/types/instanceConfig";
import {
	instanceGroupKey,
	instanceKey,
} from "../savedTimeline/rowsToSavedTimeline";
import { groupByKey, sortByStart } from "../timelineGuards";
import type { DesiredTimeline, SavedTimeline } from "../types/timeline";
import type { TimelineRow } from "../types/timelineRow";
import type { DesiredSegment } from "../types/timelineSegment";
import { type InstanceSlot, savedInstanceSlots } from "./instanceSlots";
import { placeRequestedPlan } from "./placeRequestedPlan";
import type { RequestedPhase, RequestedPlan } from "./types/requestedPhase";

const segmentEndsAt = ({
	plan,
	nextPhaseStartsAt,
	endsAt,
}: {
	plan: RequestedPlan;
	nextPhaseStartsAt: number | undefined;
	endsAt: number | null;
}): number | null => {
	if (isOneOffProduct({ product: plan.fullProduct })) return null;
	if (plan.ongoing) return endsAt;
	return nextPhaseStartsAt ?? endsAt;
};

/** One instance listed unchanged across consecutive phases is one segment, so one row. */
const mergeContiguousSegments = (
	segments: DesiredSegment[],
): DesiredSegment[] =>
	[...groupByKey(segments).values()].flatMap((keySegments) => {
		const merged: DesiredSegment[] = [];
		for (const segment of sortByStart(keySegments)) {
			const previous = merged[merged.length - 1];
			const continuesPrevious =
				previous !== undefined &&
				!segment.lifetime &&
				previous.endsAt === segment.startsAt &&
				previous.configHash === segment.configHash;
			if (previous && continuesPrevious) {
				merged[merged.length - 1] = {
					...previous,
					endsAt: segment.endsAt,
					mergedSources: [...(previous.mergedSources ?? []), segment.source],
				};
			} else {
				merged.push(segment);
			}
		}
		return merged;
	});

const slotsForGroup = ({
	slotsByGroup,
	groupKey,
}: {
	slotsByGroup: Map<string, InstanceSlot[]>;
	groupKey: string;
}) => {
	const slots = slotsByGroup.get(groupKey) ?? [];
	slotsByGroup.set(groupKey, slots);
	return slots;
};

const recordSegment = ({
	slots,
	slotIndex,
	segment,
	externalId,
}: {
	slots: InstanceSlot[];
	slotIndex: number;
	segment: DesiredSegment;
	externalId?: string;
}) => {
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
	slot.desired.push(segment);
	if (externalId) slot.externalIds.add(externalId);
};

/** The request's phases as per-instance segments, each placed on the saved instance it continues. */
export const requestedPhasesToDesiredTimeline = ({
	phases,
	endsAt,
	saved,
	rows,
	grantedLicensesById,
	interner,
	now,
}: {
	phases: RequestedPhase[];
	endsAt: number | null;
	saved: SavedTimeline;
	rows: TimelineRow[];
	grantedLicensesById: Map<string, GrantedLicense[]>;
	interner: ConfigInterner;
	now: number;
}): DesiredTimeline => {
	const slotsByGroup = savedInstanceSlots({
		saved,
		rows,
		grantedLicensesById,
		now,
	});
	const segments: DesiredSegment[] = [];

	phases.forEach((phase, phaseIndex) => {
		const nextPhaseStartsAt = phases[phaseIndex + 1]?.startsAt;
		const takenByGroup = new Map<string, Set<number>>();

		for (const plan of phase.plans) {
			const identity = {
				planId: plan.fullProduct.id,
				internalEntityId: plan.internalEntityId,
			};
			const groupKey = instanceGroupKey(identity);
			const slots = slotsForGroup({ slotsByGroup, groupKey });
			const takenSlots = takenByGroup.get(groupKey) ?? new Set<number>();
			takenByGroup.set(groupKey, takenSlots);

			const { slot, configHash } = placeRequestedPlan({
				plan,
				phase,
				isOpeningPhase: phaseIndex === 0,
				slots,
				takenSlots,
				interner,
			});
			takenSlots.add(slot);

			const segment: DesiredSegment = {
				key: instanceKey({ ...identity, slot }),
				...identity,
				replacementKey: productToReplacementKey({ product: plan.fullProduct }),
				configHash,
				lifetime: isOneOffProduct({ product: plan.fullProduct }),
				paidRecurring: isProductPaidAndRecurring(plan.fullProduct),
				startsAt: plan.ongoing ? now : phase.startsAt,
				endsAt: segmentEndsAt({ plan, nextPhaseStartsAt, endsAt }),
				source: plan.source,
			};
			recordSegment({
				slots,
				slotIndex: slot,
				segment,
				externalId: plan.externalId,
			});
			segments.push(segment);
		}
	});

	return { segments: mergeContiguousSegments(segments), endsAt };
};
