import type { FullPlanLicense, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

export type LicenseParentContext = {
	parent: FullProduct;
	link: FullPlanLicense;
};

export const listLicenseParentContexts = async ({
	ctx,
	child,
}: {
	ctx: AutumnContext;
	child: FullProduct;
}): Promise<LicenseParentContext[]> => {
	const reverseLinks = child.parent_plan_licenses ?? [];
	if (reverseLinks.length === 0) return [];

	const parentPlanIds = [
		...new Set(reverseLinks.map((link) => link.product.id)),
	];
	const parentProducts = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: parentPlanIds,
		returnAll: true,
	});
	const parentByInternalId = new Map(
		parentProducts.map((parent) => [parent.internal_id, parent]),
	);

	return reverseLinks.flatMap((reverseLink) => {
		const parent = parentByInternalId.get(
			reverseLink.parent_internal_product_id,
		);
		const link = parent?.licenses?.find(
			(candidate) => candidate.id === reverseLink.id,
		);
		return parent && link ? [{ parent, link }] : [];
	});
};
