import { expect } from "bun:test";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** Unique index `unique_active_product` requires deactivating the current pointer first. */
export const forceActiveVersion = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
}) => {
	const versions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
		skipCache: true,
	});
	for (const product of versions) {
		if (product.active && product.version !== version) {
			await ProductService.updateByInternalId({
				db: ctx.db,
				internalId: product.internal_id,
				update: { active: false },
			});
		}
	}
	const target = versions.find((product) => product.version === version);
	expect(target).toBeDefined();
	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: target!.internal_id,
		update: { active: true },
	});
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });
};
