import { ProductCatalogType } from "@autumn/shared";
import { ProductService } from "./ProductService.js";

type PlanArgs<T extends (args: any) => any> = Omit<
	Parameters<T>[0],
	"catalogType"
>;

const withPlanCatalog = <T extends object>(args: T) => ({
	...args,
	catalogType: ProductCatalogType.Plan,
});

export class PlanService {
	static getByFeature(args: PlanArgs<typeof ProductService.getByFeature>) {
		return ProductService.getByFeature(withPlanCatalog(args));
	}

	static getByStripeProductIds(
		args: PlanArgs<typeof ProductService.getByStripeProductIds>,
	) {
		return ProductService.getByStripeProductIds(withPlanCatalog(args));
	}

	static listDefault(args: PlanArgs<typeof ProductService.listDefault>) {
		return ProductService.listDefault(withPlanCatalog(args));
	}

	static get(args: PlanArgs<typeof ProductService.get>) {
		return ProductService.get(withPlanCatalog(args));
	}

	static listCachedAllVersions(
		args: PlanArgs<typeof ProductService.listCachedAllVersions>,
	) {
		return ProductService.listCachedAllVersions(withPlanCatalog(args));
	}

	static listFull(args: PlanArgs<typeof ProductService.listFull>) {
		return ProductService.listFull(withPlanCatalog(args));
	}

	static listVariantsByParent(
		args: PlanArgs<typeof ProductService.listVariantsByParent>,
	) {
		return ProductService.listVariantsByParent(withPlanCatalog(args));
	}

	static getFull(args: PlanArgs<typeof ProductService.getFull>) {
		return ProductService.getFull(withPlanCatalog(args));
	}
}
