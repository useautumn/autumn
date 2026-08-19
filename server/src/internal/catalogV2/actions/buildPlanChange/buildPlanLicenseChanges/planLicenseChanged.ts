import { isDeepStrictEqual } from "node:util";
import type { Feature, FullPlanLicense } from "@autumn/shared";
import { buildLicenseEffectivePlanChange } from "./buildLicenseEffectivePlanChange.js";
import { buildPlanLicensePreviousAttributes } from "./buildPlanLicensePreviousAttributes.js";
import { fullPlanLicenseToCustomize } from "./fullPlanLicenseToCustomize.js";

export const planLicenseChanged = ({
	from,
	to,
	features,
}: {
	from: FullPlanLicense;
	to: FullPlanLicense;
	features?: Feature[];
}) =>
	buildPlanLicensePreviousAttributes({ from, to }) !== null ||
	!isDeepStrictEqual(from.metadata ?? {}, to.metadata ?? {}) ||
	!isDeepStrictEqual(
		fullPlanLicenseToCustomize({ license: from, features }),
		fullPlanLicenseToCustomize({ license: to, features }),
	) ||
	buildLicenseEffectivePlanChange({ from, to, features }) !== undefined;
