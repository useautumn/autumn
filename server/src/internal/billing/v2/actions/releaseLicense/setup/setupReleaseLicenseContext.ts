import {
	EntityNotFoundError,
	fullCustomerToCustomerLicenses,
	type ReleaseLicenseParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { listFullSubjectsByEntityIds } from "@/internal/entities/repos/listFullSubjectsByEntityIds.js";
import type { ReleaseLicenseContext } from "../types.js";
import { resolveLicenseRelease } from "./resolveLicenseRelease.js";

/** Entity subjects carry the seats (bounded by the request); the full
 * customer carries the pools. Compute stays a pure plan assembly. */
export const setupReleaseLicenseContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: ReleaseLicenseParamsV0;
}): Promise<ReleaseLicenseContext> => {
	const [fullCustomer, fullSubjects] = await Promise.all([
		setupFullCustomerContext({
			ctx,
			params: { customer_id: params.customer_id },
		}),
		listFullSubjectsByEntityIds({
			ctx,
			customerId: params.customer_id,
			entityIds: params.entity_ids,
		}),
	]);
	const customerLicenses = fullCustomerToCustomerLicenses({ fullCustomer });

	const releases = params.entity_ids.map((entityId) => {
		const subject = fullSubjects.find(
			(candidate) =>
				candidate.entity?.id === entityId ||
				candidate.entity?.internal_id === entityId,
		);
		if (!subject?.entity) throw new EntityNotFoundError({ entityId });

		return resolveLicenseRelease({
			subject: { ...subject, entity: subject.entity },
			licensePlanId: params.license_plan_id,
			customerLicenses,
		});
	});

	return { fullCustomer, entityIds: params.entity_ids, releases };
};
