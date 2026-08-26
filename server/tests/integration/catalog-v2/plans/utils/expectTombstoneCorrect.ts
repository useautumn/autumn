import { expect } from "bun:test";
import { customerProducts } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** A tombstoned version is hidden, slug-free, and keeps expired customer_products. */
export const expectTombstoneCorrect = async ({
	ctx,
	autumn,
	planId,
	version,
	previousVersionSlug,
	internalId,
	customerProductId,
}: {
	ctx: AutumnContext;
	autumn?: AutumnInt;
	planId: string;
	version: number;
	previousVersionSlug: string;
	internalId: string;
	customerProductId?: string;
}) => {
	const pinned = await ProductService.get({
		db: ctx.db,
		id: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});
	expect(pinned).toBeUndefined();

	const live = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
		skipCache: true,
	});
	expect(live.some((product) => product.version === version)).toBe(false);

	const occupancy = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
		includeDeleted: true,
		skipCache: true,
	});
	const row = occupancy.find((product) => product.version === version);
	expect(row?.deleted_at).toBeTruthy();
	expect(row?.version_slug).toBeNull();
	expect(row?.previous_version_slug).toBe(previousVersionSlug);
	expect(row?.internal_id).toBe(internalId);
	expect(row?.active).toBe(false);

	if (autumn) {
		const catalog = await autumn.catalogV2.get({ include_archived: true });
		expect(
			catalog.plans.some(
				(plan) => plan.id === planId && plan.version === version,
			),
		).toBe(false);
	}

	if (!customerProductId) return;
	const [customerProduct] = await ctx.db
		.select()
		.from(customerProducts)
		.where(eq(customerProducts.id, customerProductId));
	expect(customerProduct).toBeDefined();
	expect(customerProduct?.internal_product_id).toBe(internalId);
};
