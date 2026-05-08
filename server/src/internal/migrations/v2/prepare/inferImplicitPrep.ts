import type { Migration, Operations } from "@autumn/shared";
import type {
	EnsurePricesAndEntitlementsInput,
	ensurePricesAndEntitlements,
} from "./modules/ensurePricesAndEntitlements/index.js";

/** One instance of a prep module to run. */
export type ImplicitPrepInstance = {
	key: string;
	module: typeof ensurePricesAndEntitlements;
	input: EnsurePricesAndEntitlementsInput;
};

/**
 * Pure walker. Takes an `operations` object directly so scripts (and
 * any other caller) can derive prep instances without a Migration row.
 * Module key format: `<kind>:<feature_id>:<plan_id>`.
 */
export const inferPrepareModules = ({
	operations,
}: {
	operations: Operations | null | undefined;
}): ImplicitPrepInstance[] => {
	void operations;
	return [];
};

/** Migration-fed shim. */
export const inferImplicitPrep = (
	migration: Migration,
): ImplicitPrepInstance[] =>
	inferPrepareModules({ operations: migration.operations });
