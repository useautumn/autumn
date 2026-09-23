import {
	type CatalogKey,
	planLicensesToItemCatalogKeys,
	type SubjectState,
	subjectStateToPlanLicenseCatalogKeys,
} from "@autumn/balance-engine";
import type { SubjectScope } from "../types/subject.js";

/** The state's plan licenses plus the rows the cached ones are made of; items are only known once their license is cached. */
export const readPlanLicenseCatalogKeys = ({
	scope,
	state,
	allowStale = false,
}: {
	scope: SubjectScope;
	state: SubjectState;
	allowStale?: boolean;
}): CatalogKey[] => {
	const planLicenseKeys = subjectStateToPlanLicenseCatalogKeys({ state });
	const planLicenses = scope.ctx.catalogCache.read({
		keys: planLicenseKeys,
		allowStale,
	});
	return [
		...planLicenseKeys,
		...planLicensesToItemCatalogKeys({ catalog: planLicenses }),
	];
};
