import type {
	ApiPlanV1,
	CatalogPlanVersioningStrategy,
	CatalogPropagateParams,
	Feature,
	FrontendProduct,
	MigrationParamsInput,
	PlanLicenseParams,
	ProductItem,
	UpdateCatalogPlanParamsInput,
} from "@autumn/shared";
import { frontendProductToApiPlanV1 } from "../versioning/buildMigrationDraft";
import { alignTierCurrencyShapes } from "../utils/currencyUtils";

const omitStripePriceId = <T extends object>(
	value: T,
): Omit<T, "stripe_price_id"> => {
	const { stripe_price_id: _stripePriceId, ...rest } = value as T & {
		stripe_price_id?: unknown;
	};
	return rest;
};

const planItemsToCatalogParams = (
	items: ApiPlanV1["items"],
): NonNullable<UpdateCatalogPlanParamsInput["items"]> =>
	items.map(
		({ feature, display, reset, price, proration, rollover, ...item }) => ({
			...omitStripePriceId(item),
			...(reset ? { reset } : {}),
			...(price ? { price: omitStripePriceId(price) } : {}),
			...(proration ? { proration } : {}),
			...(rollover
				? {
						rollover: {
							expiry_duration_type: rollover.expiry_duration_type,
							expiry_duration_length: rollover.expiry_duration_length,
							...(rollover.max != null ? { max: rollover.max } : {}),
							...(rollover.max_percentage != null
								? { max_percentage: rollover.max_percentage }
								: {}),
						},
					}
				: {}),
		}),
	);

const pinsVersion = (
	versioning: CatalogPlanVersioningStrategy | undefined,
) => versioning == null || versioning === "existing";

export const buildUpdateCatalogPlanParams = ({
	baseProduct,
	editedProduct,
	features,
	versioning,
	propagate,
	licenses,
	migration,
	includeContent = true,
}: {
	baseProduct?: FrontendProduct | null;
	editedProduct: FrontendProduct;
	features: Feature[];
	versioning?: CatalogPlanVersioningStrategy;
	propagate?: CatalogPropagateParams;
	licenses?: PlanLicenseParams[];
	migration?: MigrationParamsInput;
	/** When false, omit items/price/free_trial so a licenses-only write preserves them. */
	includeContent?: boolean;
}): UpdateCatalogPlanParamsInput => {
	const source = baseProduct ?? editedProduct;
	const plan = frontendProductToApiPlanV1(
		{
			...editedProduct,
			items: editedProduct.items.map((item) =>
				alignTierCurrencyShapes(item as ProductItem),
			) as typeof editedProduct.items,
		},
		features,
	);

	return {
		plan_id: source.id,
		...(pinsVersion(versioning) && baseProduct?.version
			? { version: baseProduct.version }
			: {}),
		...(versioning && versioning !== "existing"
			? { versioning }
			: {}),
		name: plan.name,
		description: plan.description,
		group: plan.group ?? "",
		add_on: plan.add_on,
		is_default: editedProduct.is_default,
		auto_enable: plan.auto_enable,
		archived: plan.archived,
		...(includeContent
			? {
					price: plan.price ? omitStripePriceId(plan.price) : plan.price,
					items: planItemsToCatalogParams(plan.items),
					free_trial: plan.free_trial ?? null,
				}
			: {}),
		config: plan.config,
		billing_controls: plan.billing_controls,
		...(licenses !== undefined ? { licenses } : {}),
		...(propagate !== undefined ? { propagate } : {}),
		...(migration !== undefined ? { migration } : {}),
	};
};

export const tryBuildUpdateCatalogPlanParams = (
	args: Parameters<typeof buildUpdateCatalogPlanParams>[0],
): UpdateCatalogPlanParamsInput | null => {
	try {
		return buildUpdateCatalogPlanParams(args);
	} catch {
		return null;
	}
};
