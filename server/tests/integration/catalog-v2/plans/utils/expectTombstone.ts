import { expect } from "bun:test";
import { customerProducts } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** Pin-remove tombstone: hidden from live reads, slug freed, occupancy + CPs remain. */
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
	autumn: AutumnInt;
	planId: string;
	version: number;
	previousVersionSlug: string;
	internalId: string;
	customerProductId: string;
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
	const occupancyRow = occupancy.find((product) => product.version === version);
	expect(occupancyRow?.deleted_at).toBeTruthy();
	expect(occupancyRow?.version_slug).toBeNull();
	expect(occupancyRow?.previous_version_slug).toBe(previousVersionSlug);
	expect(occupancyRow?.internal_id).toBe(internalId);

	const catalog = await autumn.catalogV2.get({ include_archived: true });
	expect(catalog.plans.find((plan) => plan.id === planId)?.version).not.toBe(
		version,
	);

	const [customerProduct] = await ctx.db
		.select()
		.from(customerProducts)
		.where(eq(customerProducts.id, customerProductId));
	expect(customerProduct).toBeDefined();
	expect(customerProduct?.internal_product_id).toBe(internalId);
};
