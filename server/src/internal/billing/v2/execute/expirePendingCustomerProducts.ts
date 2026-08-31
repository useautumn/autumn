import { type AppEnv, CusProductStatus } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { Logger } from "@/external/logtail/logtailUtils";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export const expirePendingCustomerProducts = async ({
	db,
	logger,
	orgId,
	env,
	metadataId,
}: {
	db: DrizzleCli;
	logger: Logger;
	orgId: string;
	env: AppEnv;
	metadataId: string;
}) => {
	const pendingCustomerProducts = await CusProductService.getByMetadataId({
		db,
		metadataId,
		orgId,
		env,
		inStatuses: [CusProductStatus.Pending],
	});

	if (!pendingCustomerProducts.length) return;

	const ctx = {
		db,
		logger,
		org: { id: orgId },
		env,
		redisV2: resolveRedisV2(),
	};
	const now = Date.now();

	for (const customerProduct of pendingCustomerProducts) {
		if ((customerProduct.subscription_ids ?? []).length > 0) continue;

		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: {
				status: CusProductStatus.Expired,
				ended_at: now,
				metadata_id: null,
			},
		});
	}
};
