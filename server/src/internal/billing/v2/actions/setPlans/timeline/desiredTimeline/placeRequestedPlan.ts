import { isOneOffProduct } from "@autumn/shared";
import type { ConfigInterner } from "../instanceConfig/createConfigInterner";
import { requestedPlanToInstanceConfig } from "../instanceConfig/instanceConfigs";
import type { LicenseConfig } from "../instanceConfig/types/instanceConfig";
import { isAliveAt } from "../timelineGuards";
import type { InstanceSlot } from "./instanceSlots";
import type { RequestedPhase, RequestedPlan } from "./types/requestedPhase";

const INCLUDED_ONLY: LicenseConfig = { type: "includedOnly" };

/** The opening phase keeps the seats a running instance holds unless it names new totals. */
const omittedLicensesFor = ({
	slot,
	isOpeningPhase,
}: {
	slot?: InstanceSlot;
	isOpeningPhase: boolean;
}): LicenseConfig =>
	isOpeningPhase && slot?.savedLive
		? { type: "granted", licenses: slot.savedLive.grantedLicenses }
		: INCLUDED_ONLY;

const lastDesiredSegment = (slot: InstanceSlot) =>
	slot.desired[slot.desired.length - 1];

const continuesInto = ({
	slot,
	startsAt,
}: {
	slot: InstanceSlot;
	startsAt: number;
}) => lastDesiredSegment(slot)?.endsAt === startsAt;

const isOccupiedAt = ({
	slot,
	startsAt,
}: {
	slot: InstanceSlot;
	startsAt: number;
}) => slot.desired.some((segment) => isAliveAt({ segment, at: startsAt }));

type SlotRule = (slot: InstanceSlot) => boolean;

/** Chooses the instance a requested plan continues, preferring the one it leaves unchanged. */
export const placeRequestedPlan = ({
	plan,
	phase,
	isOpeningPhase,
	slots,
	takenSlots,
	interner,
}: {
	plan: RequestedPlan;
	phase: RequestedPhase;
	isOpeningPhase: boolean;
	slots: InstanceSlot[];
	takenSlots: Set<number>;
	interner: ConfigInterner;
}): { slot: number; configHash: string } => {
	const lifetime = isOneOffProduct({ product: plan.fullProduct });
	const configHashFor = (slot?: InstanceSlot) =>
		interner.configHash(
			requestedPlanToInstanceConfig({
				fullProduct: plan.fullProduct,
				featureQuantities: plan.featureQuantities,
				customerLicenseQuantities: plan.customerLicenseQuantities,
				omittedLicenses: omittedLicensesFor({ slot, isOpeningPhase }),
				resetsBillingCycle: !isOpeningPhase && phase.resetsBillingCycle,
			}),
		);

	const candidates = slots.filter(
		(slot) =>
			!takenSlots.has(slot.slot) &&
			!isOccupiedAt({ slot, startsAt: phase.startsAt }),
	);
	const holdsAnotherPurchase = (slot: InstanceSlot) =>
		slot.savedLive?.lifetime === true &&
		slot.savedLive.configHash !== configHashFor(slot);

	const rules: SlotRule[] = [
		(slot) =>
			plan.externalId !== undefined && slot.externalIds.has(plan.externalId),
		(slot) =>
			continuesInto({ slot, startsAt: phase.startsAt }) &&
			lastDesiredSegment(slot)?.configHash === configHashFor(slot),
		(slot) =>
			isOpeningPhase && slot.savedLive?.configHash === configHashFor(slot),
		(slot) => !lifetime && continuesInto({ slot, startsAt: phase.startsAt }),
		(slot) =>
			isOpeningPhase &&
			!lifetime &&
			slot.savedLive !== undefined &&
			!slot.savedLive.lifetime,
		(slot) => !isOpeningPhase && slot.savedStarts.includes(phase.startsAt),
		(slot) => !holdsAnotherPurchase(slot) && !(lifetime && slot.savedLive),
	];

	for (const rule of rules) {
		const match = [...candidates]
			.sort((first, second) => first.slot - second.slot)
			.find(rule);
		if (match) return { slot: match.slot, configHash: configHashFor(match) };
	}

	const nextSlot =
		Math.max(-1, ...slots.map(({ slot }) => slot), ...takenSlots) + 1;
	return { slot: nextSlot, configHash: configHashFor() };
};
