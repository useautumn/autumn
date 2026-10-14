import { expect } from "bun:test";
import { customerProducts } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const fetchAttachedPlanRows = async ({
	ctx,
	internalCustomerId,
	planId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	planId: string;
}) =>
	ctx.db
		.select()
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				eq(customerProducts.product_id, planId),
			),
		);

export const expectAttachedPlanVersionCorrect = async ({
	ctx,
	internalCustomerId,
	planId,
	version,
	count,
	entityId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	planId: string;
	version?: number;
	count?: number;
	entityId?: string | true;
}) => {
	const rows = await fetchAttachedPlanRows({
		ctx,
		internalCustomerId,
		planId,
	});
	const scoped =
		entityId === undefined
			? rows
			: rows.filter((row) =>
					entityId === true ? Boolean(row.entity_id) : row.entity_id === entityId,
				);

	if (count !== undefined) {
		expect(
			scoped,
			"exactly one version of the default plan may attach",
		).toHaveLength(count);
	} else if (version !== undefined) {
		expect(
			scoped,
			"exactly one version of the default plan may attach",
		).toHaveLength(1);
	}

	if (version !== undefined) {
		const product = await ProductService.get({
			db: ctx.db,
			id: planId,
			orgId: ctx.org.id,
			env: ctx.env,
			version,
		});
		expect(product, `missing ${planId} v${version}`).toBeDefined();
		if (!product) return;
		expect(scoped[0]?.internal_product_id).toBe(product.internal_id);
	}

	if (entityId === true) {
		expect(scoped[0]?.entity_id).toBeTruthy();
	} else if (entityId !== undefined) {
		expect(scoped[0]?.entity_id).toBe(entityId);
	}
};
