import {
	type DiffedCustomizePlanV1,
	diffPlanV1,
	type Feature,
	type FullPlanLicense,
	type FullProductWithoutLicenses,
} from "@autumn/shared";
import { fullProductToApiPlanV1Sync } from "./fullProductToApiPlanV1Sync";

/** Diff two product rows in plan space — price, items, trial, and licenses. */
export const diffFullProducts = ({
	from,
	to,
	features,
}: {
	from: FullProductWithoutLicenses & { licenses?: FullPlanLicense[] };
	to: FullProductWithoutLicenses & { licenses?: FullPlanLicense[] };
	features?: Feature[];
}): DiffedCustomizePlanV1 =>
	diffPlanV1({
		from: fullProductToApiPlanV1Sync({ product: from, features }),
		to: fullProductToApiPlanV1Sync({ product: to, features }),
	});
