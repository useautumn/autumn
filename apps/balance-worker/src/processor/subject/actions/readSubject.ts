import {
	type Catalog,
	filterCatalogKeysMissingFrom,
	type MeteringIdentity,
	type SubjectState,
	subjectStateToCatalogKeys,
	subjectStateToFreeTrialCatalogKeys,
	subjectStateToFullSubject,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import { markFullSubjectImmutable } from "@autumn/shared";
import { SubjectCatalogEvictedError } from "../subjectErrors.js";
import type { SubjectScope } from "../types/subject.js";
import { readPlanLicenseCatalogKeys } from "./readPlanLicenseCatalogKeys.js";

const joinSubjectCatalog = ({
	scope,
	state,
}: {
	scope: SubjectScope;
	state: SubjectState;
}): Catalog => {
	const keys = subjectStateToCatalogKeys({ state });
	const catalog = scope.ctx.catalogCache.read({
		keys: [
			...keys,
			...readPlanLicenseCatalogKeys({ scope, state, allowStale: true }),
			...subjectStateToFreeTrialCatalogKeys({ state }),
		],
		allowStale: true,
	});
	const missing = filterCatalogKeysMissingFrom({ keys, catalog });
	if (missing.length > 0)
		throw new SubjectCatalogEvictedError({ keys: missing });
	return catalog;
};

export const readSubjectCatalog = ({
	scope,
	state,
}: {
	scope: SubjectScope;
	state: SubjectState;
}): Catalog =>
	scope.state.joinCache.readCatalog({
		state,
		join: () => joinSubjectCatalog({ scope, state }),
	});

export const readSubject = ({
	scope,
	state,
	identity,
}: {
	scope: SubjectScope;
	state: SubjectState;
	identity: MeteringIdentity;
}): WorkerFullSubject =>
	scope.state.joinCache.readFullSubject({
		state,
		entityId: identity.entityId,
		join: () =>
			markFullSubjectImmutable({
				fullSubject: subjectStateToFullSubject({
					state,
					catalog: readSubjectCatalog({ scope, state }),
					entityId: identity.entityId,
				}),
			}),
	});
