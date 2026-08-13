import { hashJson } from "@/utils/hash/hashJson.js";

/** Content-addressed so a re-run recomputes the same id and converges on
 * ON CONFLICT (id) — plan_license has no natural key for custom rows. */
const preparedRowId = ({
	prefix,
	value,
}: {
	prefix: "plan_lic" | "ent";
	value: unknown;
}): string => `${prefix}_${hashJson({ value })}`;

export const planLicenseIdFor = ({
	scopeId,
	opIndex,
	licensePlanId,
	parentInternalProductId,
	hash,
}: {
	scopeId: string;
	opIndex: number;
	licensePlanId: string;
	parentInternalProductId: string;
	hash: string;
}): string =>
	preparedRowId({
		prefix: "plan_lic",
		value: {
			scopeId,
			opIndex,
			licensePlanId,
			parentInternalProductId,
			hash,
			kind: "plan_license",
		},
	});

export const licenseEntitlementIdFor = ({
	scopeId,
	opIndex,
	licensePlanId,
	itemIndex,
	internalFeatureId,
	licenseInternalProductId,
	hash,
}: {
	scopeId: string;
	opIndex: number;
	licensePlanId: string;
	itemIndex: number;
	internalFeatureId: string;
	licenseInternalProductId: string;
	hash: string;
}): string =>
	preparedRowId({
		prefix: "ent",
		value: {
			scopeId,
			opIndex,
			licensePlanId,
			itemIndex,
			internalFeatureId,
			licenseInternalProductId,
			hash,
			kind: "license_add_item",
		},
	});
