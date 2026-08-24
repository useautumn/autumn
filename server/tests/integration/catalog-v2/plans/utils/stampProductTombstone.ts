import { expect } from "bun:test";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** Test-only: mark a version tombstoned the way Unit 3 will. */
export const stampProductTombstone = async ({
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
		includeDeleted: true,
		skipCache: true,
	});
	const target = versions.find((product) => product.version === version);
	expect(target, `missing ${planId} v${version} to tombstone`).toBeDefined();
	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: target!.internal_id,
		update: {
			deleted_at: Date.now(),
			previous_version_slug: target!.version_slug,
			version_slug: null,
		},
	});
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });
	return target!;
};
