import {
	ErrCode,
	type FullCustomerLicense,
	type FullSubject,
	filterLicenseAssignmentsByEntityId,
	findCustomerLicenseByLinkId,
	RecaseError,
} from "@autumn/shared";
import type { LicenseRelease } from "../types.js";

/** Exactly one live assignment per entity: zero has nothing to release, more
 * than one is ambiguous without (or even with) a license_plan_id filter. */
export const resolveLicenseRelease = ({
	subject,
	licensePlanId,
	customerLicenses,
}: {
	subject: FullSubject & { entity: NonNullable<FullSubject["entity"]> };
	licensePlanId?: string;
	customerLicenses: FullCustomerLicense[];
}): LicenseRelease => {
	const { entity } = subject;
	const assignments = filterLicenseAssignmentsByEntityId({
		customerProducts: subject.customer_products,
		internalEntityId: entity.internal_id,
		licensePlanId,
	});

	const entityId = entity.id ?? entity.internal_id;
	if (assignments.length === 0) {
		throw new RecaseError({
			message: licensePlanId
				? `Entity ${entityId} has no license ${licensePlanId} to release.`
				: `Entity ${entityId} has no license to release.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (assignments.length > 1) {
		throw new RecaseError({
			message: licensePlanId
				? `Entity ${entityId} holds multiple assignments of license ${licensePlanId}.`
				: `Entity ${entityId} holds multiple licenses. Provide license_plan_id.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const assignment = assignments[0];
	const customerLicense = findCustomerLicenseByLinkId({
		customerLicenses,
		customerLicenseLinkId: assignment.customer_license_link_id,
	});
	if (!customerLicense) {
		throw new RecaseError({
			message: `License assignment for entity ${entityId} has no pool to release to.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return { entity, assignment, customerLicense };
};
