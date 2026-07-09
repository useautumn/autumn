import {
	type AppEnv,
	CusProductStatus,
	type Organization,
} from "@autumn/shared";
import type { CronContext } from "@/cron/utils/CronContext.js";
import type { RepoContext } from "@/db/repoContext.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { afterLicenseMutation } from "@/internal/licenses/actions/reconcile/afterLicenseMutation.js";
import { batchUpdateCustomerProducts } from "../repos/batchUpdateCustomerProducts.js";
import type { OneOffCustomerProductResult } from "./oneOffCustomerProductResult.js";

export const expireOneOffCustomerProductResults = async ({
	ctx,
	results,
	source,
}: {
	ctx: CronContext;
	results: OneOffCustomerProductResult[];
	source: string;
}) => {
	const grouped = new Map<
		string,
		{
			org: Organization;
			env: AppEnv;
			customerProductIds: Set<string>;
			internalCustomerIdByCustomerId: Map<string, string>;
		}
	>();

	for (const result of results) {
		const key = `${result.org.id}:${result.customer.env}`;
		const group = grouped.get(key) ?? {
			org: result.org,
			env: result.customer.env,
			customerProductIds: new Set<string>(),
			internalCustomerIdByCustomerId: new Map<string, string>(),
		};
		group.customerProductIds.add(result.customer_product.id);
		if (result.customer.id) {
			group.internalCustomerIdByCustomerId.set(
				result.customer.id,
				result.customer.internal_id,
			);
		}
		grouped.set(key, group);
	}

	for (const group of grouped.values()) {
		const repoContext: RepoContext = {
			db: ctx.db,
			org: group.org,
			env: group.env,
			logger: ctx.logger,
			redisV2: resolveRedisV2(),
		};

		await batchUpdateCustomerProducts({
			ctx: repoContext,
			updates: [...group.customerProductIds].map((id) => ({
				id,
				updates: { status: CusProductStatus.Expired },
			})),
		});

		for (const [
			customerId,
			internalCustomerId,
		] of group.internalCustomerIdByCustomerId) {
			const licenseCtx = repoContext as unknown as AutumnContext;
			await afterLicenseMutation({
				ctx: licenseCtx,
				customerId,
				internalCustomerId,
			});
			await deleteCachedFullCustomer({ ctx: licenseCtx, customerId, source });
		}
	}

	return new Set(results.map((result) => result.customer_product.id)).size;
};
