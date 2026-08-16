import type { CustomizePlanLicense } from "@models/licenseModels/licenseModels";
import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums";
import { basePriceToKey } from "@utils/planV1Utils/convertCustomize/basePriceToKey";
import { createPlanItemToKey } from "@utils/planV1Utils/convertPlanItem/createPlanItemToKey";
import {
	type DiffedCustomizePlanV1,
	planItemFilterMatchKey,
} from "@utils/planV1Utils/diff/diffPlanV1";

const ABSENT = "";

const sortedJoin = (keys: string[]): string => [...keys].sort().join(",");

const priceToKey = ({
	price,
}: {
	price: DiffedCustomizePlanV1["price"];
}): string => {
	if (price === undefined) return ABSENT;
	if (price === null) return "null";
	return basePriceToKey({ price });
};

const freeTrialToKey = ({
	freeTrial,
}: {
	freeTrial: NonNullable<DiffedCustomizePlanV1["free_trial"]>;
}): string =>
	[
		`duration_length:${freeTrial.duration_length}`,
		`duration_type:${freeTrial.duration_type ?? FreeTrialDuration.Month}`,
		`card_required:${freeTrial.card_required ?? true}`,
		`on_end:${freeTrial.on_end ?? "bill"}`,
	].join(",");

const freeTrialSegment = ({
	freeTrial,
}: {
	freeTrial: DiffedCustomizePlanV1["free_trial"];
}): string => {
	if (freeTrial === undefined) return ABSENT;
	if (freeTrial === null) return "null";
	return freeTrialToKey({ freeTrial });
};

const upsertLicenseToKey = ({
	license,
}: {
	license: CustomizePlanLicense;
}): string =>
	[
		license.license_plan_id,
		customizeToKey({ customize: license.customize ?? {} }),
		`included:${license.included ?? ""}`,
		`prepaid_only:${license.prepaid_only ?? ""}`,
	].join(":");

/** Stable identity of a customize payload: `price:…|add_items:…|remove_items:…|free_trial:…|upsert_licenses:…|remove_licenses:…`. */
export const customizeToKey = ({
	customize,
}: {
	customize: DiffedCustomizePlanV1;
}): string =>
	[
		`price:${priceToKey({ price: customize.price })}`,
		`add_items:${sortedJoin((customize.add_items ?? []).map((item) => createPlanItemToKey({ item })))}`,
		`remove_items:${sortedJoin((customize.remove_items ?? []).map(planItemFilterMatchKey))}`,
		`free_trial:${freeTrialSegment({ freeTrial: customize.free_trial })}`,
		`upsert_licenses:${sortedJoin((customize.upsert_licenses ?? []).map((license) => upsertLicenseToKey({ license })))}`,
		`remove_licenses:${sortedJoin((customize.remove_licenses ?? []).map((entry) => entry.license_plan_id))}`,
	].join("|");
