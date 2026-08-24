import { expect } from "bun:test";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** DB identity columns for one plan version — assert only fields passed. */
export const expectVersionIdentityCorrect = async ({
	ctx,
	planId,
	version,
	versionSlug,
	active,
	isDefault,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
	versionSlug?: string;
	active?: boolean;
	isDefault?: boolean;
}) => {
	const product = await ProductService.get({
		db: ctx.db,
		id: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});
	expect(product, `missing ${planId} v${version}`).toBeDefined();
	expect(product?.version).toBe(version);
	if (versionSlug !== undefined) {
		expect(product?.version_slug).toBe(versionSlug);
	}
	if (active !== undefined) {
		expect(product?.active).toBe(active);
	}
	if (isDefault !== undefined) {
		expect(product?.is_default).toBe(isDefault);
	}
};

/** Exactly one row of this plan holds `active`. Returns that row. */
export const expectExactlyOneActiveVersion = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const versions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
		skipCache: true,
	});
	const actives = versions.filter((product) => product.active);
	expect(actives, `${planId}: unique_active_product`).toHaveLength(1);
	return actives[0];
};

/** Flip the active pointer in DB (test-only — not a catalogV2 promote). */
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
