import type { DbPlanLicense, FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";

/**
 * Overlay resolution: a parent's effective licenses are the plan's catalog
 * links, overridden per license by any rows scoped to that customer product.
 * An override with included 0 leaves the license unassignable (tombstone).
 */
export const resolveLicenseDefinitionsForParents = async ({
	ctx,
	parents,
}: {
	ctx: AutumnContext;
	parents: FullCusProduct[];
}): Promise<Map<string, DbPlanLicense[]>> => {
	if (parents.length === 0) return new Map();

	const [catalogLinks, customerLinks] = await Promise.all([
		planLicenseRepo.listCatalogByParentInternalProductIds({
			db: ctx.db,
			parentInternalProductIds: [
				...new Set(parents.map((parent) => parent.internal_product_id)),
			],
		}),
		planLicenseRepo.listCustomerByParentCustomerProductIds({
			db: ctx.db,
			parentCustomerProductIds: parents.map((parent) => parent.id),
		}),
	]);

	const catalogByProductId = new Map<string, DbPlanLicense[]>();
	for (const link of catalogLinks) {
		const rows = catalogByProductId.get(link.parent_internal_product_id) ?? [];
		rows.push(link);
		catalogByProductId.set(link.parent_internal_product_id, rows);
	}
	const customerByParentId = new Map<string, DbPlanLicense[]>();
	for (const link of customerLinks) {
		if (!link.parent_customer_product_id) continue;
		const rows = customerByParentId.get(link.parent_customer_product_id) ?? [];
		rows.push(link);
		customerByParentId.set(link.parent_customer_product_id, rows);
	}

	const definitionsByParentId = new Map<string, DbPlanLicense[]>();
	for (const parent of parents) {
		const overrides = customerByParentId.get(parent.id) ?? [];
		const overriddenLicenseIds = new Set(
			overrides.map((link) => link.license_internal_product_id),
		);
		const inherited = (
			catalogByProductId.get(parent.internal_product_id) ?? []
		).filter(
			(link) => !overriddenLicenseIds.has(link.license_internal_product_id),
		);
		definitionsByParentId.set(parent.id, [...inherited, ...overrides]);
	}
	return definitionsByParentId;
};
