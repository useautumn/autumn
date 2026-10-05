import {
	type CustomerLicenseQuantity,
	type Feature,
	type FullPlanLicense,
	featureOptionsAreSame,
	productsAreSame,
} from "@autumn/shared";
import type {
	GrantedLicense,
	InstanceConfig,
	LicenseConfig,
} from "./types/instanceConfig";

/** A requested total means the same seats when it buys the paid seats the row already holds. */
const requestedMatchesGranted = ({
	quantities,
	licenses,
}: {
	quantities: CustomerLicenseQuantity[];
	licenses: GrantedLicense[];
}) =>
	quantities.every((quantity) => {
		const license = licenses.find(
			({ licensePlanId }) => licensePlanId === quantity.licensePlanId,
		);
		if (!license) return true;
		const included = license.granted - license.paidQuantity;
		return (
			Math.max(0, quantity.totalQuantity - included) === license.paidQuantity
		);
	});

/** Requested totals within the plan's included seats buy no paid seats, as included-only does. */
const requestedIsIncludedOnly = ({
	quantities,
	planLicenses,
}: {
	quantities: CustomerLicenseQuantity[];
	planLicenses: FullPlanLicense[];
}) =>
	quantities.every((quantity) => {
		const planLicense = planLicenses.find(
			({ product }) => product.id === quantity.licensePlanId,
		);
		return !planLicense || quantity.totalQuantity <= planLicense.included;
	});

const sortedQuantities = (quantities: CustomerLicenseQuantity[]) =>
	[...quantities]
		.sort((first, second) =>
			first.licensePlanId.localeCompare(second.licensePlanId),
		)
		.map(
			({ licensePlanId, totalQuantity }) => `${licensePlanId}:${totalQuantity}`,
		)
		.join(",");

const sortedGranted = (licenses: GrantedLicense[]) =>
	[...licenses]
		.sort((first, second) =>
			first.licensePlanId.localeCompare(second.licensePlanId),
		)
		.map(
			({ licensePlanId, granted, paidQuantity }) =>
				`${licensePlanId}:${granted}:${paidQuantity}`,
		)
		.join(",");

const licensesMatch = ({
	first,
	second,
	planLicenses,
}: {
	first: LicenseConfig;
	second: LicenseConfig;
	planLicenses: FullPlanLicense[];
}): boolean => {
	if (first.type === "granted" && second.type === "granted") {
		return sortedGranted(first.licenses) === sortedGranted(second.licenses);
	}
	if (first.type === "granted" && second.type === "requested") {
		return requestedMatchesGranted({
			quantities: second.quantities,
			licenses: first.licenses,
		});
	}
	if (first.type === "requested" && second.type === "granted") {
		return licensesMatch({ first: second, second: first, planLicenses });
	}
	if (first.type === "granted" && second.type === "includedOnly") {
		return first.licenses.every(({ paidQuantity }) => paidQuantity === 0);
	}
	if (first.type === "includedOnly" && second.type === "granted") {
		return licensesMatch({ first: second, second: first, planLicenses });
	}
	if (first.type === "requested" && second.type === "requested") {
		return (
			sortedQuantities(first.quantities) === sortedQuantities(second.quantities)
		);
	}
	if (first.type === "requested" && second.type === "includedOnly") {
		return requestedIsIncludedOnly({
			quantities: first.quantities,
			planLicenses,
		});
	}
	if (first.type === "includedOnly" && second.type === "requested") {
		return licensesMatch({ first: second, second: first, planLicenses });
	}
	return first.type === "includedOnly" && second.type === "includedOnly";
};

/** The one equality set_plans uses: same plan version, quantities, licenses and items. */
export const instanceConfigsMatch = ({
	features,
	first,
	second,
}: {
	features: Feature[];
	first: InstanceConfig;
	second: InstanceConfig;
}) => {
	const samePlanVersion =
		first.fullProduct.internal_id === second.fullProduct.internal_id;
	if (!samePlanVersion) return false;

	const sameSchedulingShape =
		first.planQuantity === second.planQuantity &&
		first.resetsBillingCycle === second.resetsBillingCycle;
	const sameFeatureQuantities = featureOptionsAreSame({
		curFeatureOptions: first.featureQuantities,
		newFeatureOptions: second.featureQuantities,
	});
	if (!sameSchedulingShape || !sameFeatureQuantities) return false;
	const planLicenses =
		second.fullProduct.licenses ?? first.fullProduct.licenses ?? [];
	if (
		!licensesMatch({
			first: first.licenses,
			second: second.licenses,
			planLicenses,
		})
	) {
		return false;
	}

	const { itemsSame } = productsAreSame({
		newProductV1: second.fullProduct,
		curProductV1: first.fullProduct,
		features,
	});
	return itemsSame;
};
