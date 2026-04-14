import type { SubjectBalance } from "@autumn/shared";
import { type ShapeSpec, sanitizeShape } from "./sanitizeCacheShapeUtils.js";

const featureShapeSpec: ShapeSpec = {
	event_names: "array",
};

const entitlementShapeSpec: ShapeSpec = {
	feature: featureShapeSpec,
};

const priceConfigShapeSpec: ShapeSpec = {
	usage_tiers: "array",
};

const priceShapeSpec: ShapeSpec = {
	config: priceConfigShapeSpec,
};

const customerPriceShapeSpec: ShapeSpec = {
	price: priceShapeSpec,
};

const rolloverShapeSpec: ShapeSpec = {
	entities: "record",
};

const subjectBalanceShapeSpec: ShapeSpec = {
	rollovers: { items: rolloverShapeSpec },
	entities: "nullable_record",
	entitlement: entitlementShapeSpec,
	customerPrice: customerPriceShapeSpec,
};

export const sanitizeCachedSubjectBalance = ({
	subjectBalance,
}: {
	subjectBalance: SubjectBalance;
}): SubjectBalance =>
	sanitizeShape<SubjectBalance>({
		value: subjectBalance,
		spec: subjectBalanceShapeSpec,
	});
