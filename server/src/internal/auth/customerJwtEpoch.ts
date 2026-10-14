import { customerJwtFamilies } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import { invalidateCustomerJwtAuth } from "@/external/redis/actions/customerJwtAuthCache/customerJwtAuthCache.js";
import { generateId } from "@/utils/genUtils.js";

export type JwtFamily = {
	epoch: number;
	refreshKid: number;
	indefinite: boolean;
	orgId: string;
	env: string;
};

export const readFamily = async ({
	internalCustomerId,
}: {
	internalCustomerId: string;
}): Promise<JwtFamily | null> => {
	const row = await db.query.customerJwtFamilies.findFirst({
		where: eq(customerJwtFamilies.internal_customer_id, internalCustomerId),
	});
	if (!row) {
		return null;
	}
	return {
		epoch: row.epoch,
		refreshKid: row.refresh_kid,
		indefinite: row.indefinite,
		orgId: row.org_id,
		env: row.env,
	};
};

export const setFamily = async ({
	internalCustomerId,
	orgId,
	env,
	epoch,
	refreshKid,
	indefinite = false,
}: {
	internalCustomerId: string;
	orgId: string;
	env: string;
	epoch: number;
	refreshKid: number;
	indefinite?: boolean;
}) => {
	const now = Date.now();
	await db
		.insert(customerJwtFamilies)
		.values({
			internal_id: generateId("cjwtfam"),
			internal_customer_id: internalCustomerId,
			org_id: orgId,
			env,
			epoch,
			refresh_kid: refreshKid,
			indefinite,
			created_at: now,
			updated_at: now,
		})
		.onConflictDoUpdate({
			target: customerJwtFamilies.internal_customer_id,
			set: { epoch, refresh_kid: refreshKid, indefinite, updated_at: now },
		});
	await invalidateCustomerJwtAuth({ internalCustomerId });
};

export const bumpEpoch = async ({
	internalCustomerId,
	orgId,
	env,
}: {
	internalCustomerId: string;
	orgId: string;
	env: string;
}) => {
	const now = Date.now();
	await db
		.insert(customerJwtFamilies)
		.values({
			internal_id: generateId("cjwtfam"),
			internal_customer_id: internalCustomerId,
			org_id: orgId,
			env,
			epoch: 1,
			refresh_kid: 0,
			indefinite: false,
			created_at: now,
			updated_at: now,
		})
		.onConflictDoUpdate({
			target: customerJwtFamilies.internal_customer_id,
			set: { epoch: sql`${customerJwtFamilies.epoch} + 1`, updated_at: now },
		});
	await invalidateCustomerJwtAuth({ internalCustomerId });
};
