import { type AppEnv, customerJwtFamilies } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import {
	type CachedCustomerJwtAuth,
	getCachedCustomerJwtAuth,
	setCachedCustomerJwtAuth,
} from "@/external/redis/actions/customerJwtAuthCache/customerJwtAuthCache.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export const getCustomerJwtAuth = async ({
	internalCustomerId,
	requestId,
}: {
	internalCustomerId: string;
	requestId?: string;
}): Promise<CachedCustomerJwtAuth | null> => {
	const cached = await getCachedCustomerJwtAuth({
		internalCustomerId,
		requestId,
	});
	if (cached) return cached;

	const family = await db.query.customerJwtFamilies.findFirst({
		where: eq(customerJwtFamilies.internal_customer_id, internalCustomerId),
	});
	if (!family) {
		return null;
	}
	const orgData = await OrgService.getWithFeatures({
		db,
		orgId: family.org_id,
		env: family.env as AppEnv,
		allowNotFound: true,
	});
	if (!orgData) {
		return null;
	}

	const value: CachedCustomerJwtAuth = {
		org: orgData.org,
		features: orgData.features,
		epoch: family.epoch,
		refreshKid: family.refresh_kid,
		indefinite: family.indefinite,
	};

	await setCachedCustomerJwtAuth({ internalCustomerId, value, requestId });

	return value;
};
