/** biome-ignore-all lint/suspicious/noDoubleEquals: legacy product comparison intentionally uses loose numeric/nullish equality */

import {
	AllowanceType,
	type Entitlement,
	type RolloverConfig,
} from "@autumn/shared";

const rolloversAreSame = ({
	rollover1,
	rollover2,
}: {
	rollover1?: RolloverConfig | null;
	rollover2?: RolloverConfig | null;
}) => {
	if (!rollover1 && !rollover2) return true;
	if (!rollover1 && rollover2) return false;
	if (rollover1 && !rollover2) return false;

	return (
		rollover1?.max == rollover2?.max &&
		rollover1?.max_percentage == rollover2?.max_percentage &&
		rollover1?.duration == rollover2?.duration &&
		rollover1?.length == rollover2?.length
	);
};

const normalizeOptionalId = (value?: string | null) => value || null;

export const entsAreSame = (ent1: Entitlement, ent2: Entitlement) => {
	if (ent1.internal_feature_id !== ent2.internal_feature_id) return false;
	if (ent1.allowance_type !== ent2.allowance_type) return false;

	const diffs = {
		interval: ent1.interval != ent2.interval,
		intervalCount: ent1.interval_count != ent2.interval_count,
		allowance:
			ent1.allowance_type !== AllowanceType.Unlimited &&
			ent1.allowance != ent2.allowance,
		carryFromPrevious: ent1.carry_from_previous != ent2.carry_from_previous,
		entityFeatureId:
			normalizeOptionalId(ent1.entity_feature_id) !==
			normalizeOptionalId(ent2.entity_feature_id),
		pooled: (ent1.pooled ?? false) !== (ent2.pooled ?? false),
		usageLimit: ent1.usage_limit != ent2.usage_limit,
		rollover: !rolloversAreSame({
			rollover1: ent1.rollover,
			rollover2: ent2.rollover,
		}),
	};

	return !Object.values(diffs).some(Boolean);
};
