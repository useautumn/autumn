import type {
	DiffedCustomizePlanV1,
	Feature,
	FullCusProduct,
	FullProduct,
} from "@autumn/shared";
import { cusProductToProduct, diffPlanV1 } from "@autumn/shared";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";

/**
 * Which keys of a plan diff mean "this customer's plan is custom".
 *
 * `diffPlanV1` can also emit `free_trial`, deliberately left out: a longer
 * trial for one customer is not a custom plan, and trials are inherited rather
 * than re-read from catalog across version changes, so those customers stay
 * intact without the flag.
 *
 * Everything else `diffPlanV1` reports counts — base price, item adds and
 * removes, and the license lane (`upsert_licenses` / `remove_licenses`).
 */
const CUSTOM_DIFF_KEYS = [
	"price",
	"add_items",
	"remove_items",
	"upsert_licenses",
	"remove_licenses",
] as const satisfies readonly (keyof DiffedCustomizePlanV1)[];

/**
 * Is this customer product a customized version of the plan it points at?
 *
 * Diffs the customer's own plan against the catalog version its
 * `internal_product_id` references — never taken from request input.
 *
 * Reuses `diffPlanV1`, the same diff the catalog and migration-draft builders
 * run on, so licenses, per-currency pricing and item identity are compared
 * exactly once in the codebase. Notably `pricesEqual` treats an added or
 * removed catalog currency as compatible and only flags a shared currency whose
 * amount moved — so offering a plan in a new currency never marks the customers
 * already on it as custom.
 *
 * `includeAdds` is on: an item or license the customer has and the plan does
 * not is a divergence, not a lifecycle event.
 *
 * Biased towards `true`. A false positive only means the customer is skipped by
 * version migrations; a false negative lets a migration overwrite genuinely
 * customized prices, entitlements and license terms.
 */
export const deriveCustomerProductIsCustom = ({
	customerProduct,
	baseProduct,
	features,
}: {
	customerProduct: FullCusProduct;
	/** The catalog version `customerProduct.internal_product_id` points at,
	 * loaded with custom rows excluded. Nullish when it could not be resolved. */
	baseProduct?: FullProduct | null;
	features: Feature[];
}): boolean => {
	// Cannot prove it matches the catalog, so assume it does not.
	if (!baseProduct) return true;

	try {
		const diff = diffPlanV1({
			from: fullProductToApiPlanV1Sync({ product: baseProduct, features }),
			to: fullProductToApiPlanV1Sync({
				product: cusProductToProduct({ cusProduct: customerProduct }),
				features,
			}),
			includeAdds: true,
		});

		return CUSTOM_DIFF_KEYS.some((key) => diff[key] !== undefined);
	} catch {
		return true;
	}
};
