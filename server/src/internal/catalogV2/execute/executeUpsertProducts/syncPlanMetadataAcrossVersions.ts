import { productDetailFieldIsSame } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productRepo } from "@/internal/products/repos/productRepo.js";

const planMetadataChanged = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): boolean => {
	if (upsert.details?.previousAttributes?.metadata !== undefined) return true;
	if (upsert.row.baseFullProduct == null) return false;
	return !productDetailFieldIsSame({
		key: "metadata",
		product1: upsert.row.nextFullProduct,
		product2: upsert.row.baseFullProduct,
	});
};

/** Metadata is plan-level; every version row must agree (legacy updateMetadataByExternalId parity). */
export const syncPlanMetadataAcrossVersions = async ({
	ctx,
	upsert,
}: {
	ctx: AutumnContext;
	upsert: UpsertProductPlan;
}) => {
	if (!planMetadataChanged({ upsert })) return;

	await productRepo.updateMetadataByExternalId({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		id: upsert.details?.product.id ?? upsert.row.nextFullProduct.id,
		metadata:
			upsert.details?.product.metadata ?? upsert.row.nextFullProduct.metadata,
	});
};
