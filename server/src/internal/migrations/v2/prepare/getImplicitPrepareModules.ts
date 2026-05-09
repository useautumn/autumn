import type { Operations } from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import type {
	EnsurePricesAndEntitlementsInput,
	ensurePricesAndEntitlements,
} from "./modules/ensurePricesAndEntitlements/index.js";
import { ensurePricesAndEntitlements as ensurePricesAndEntitlementsModule } from "./modules/ensurePricesAndEntitlements/index.js";
import { buildPrepareModuleKey } from "./utils/index.js";

/** One instance of a prep module to run. */
export type ImplicitPrepInstance = {
	key: string;
	module: typeof ensurePricesAndEntitlements;
	input: EnsurePricesAndEntitlementsInput;
};

/**
 * Pure walker. Takes an `operations` object directly so scripts and
 * other callers can derive prep instances without a Migration row.
 * Module key format: `<module_kind>:update_plan`.
 */
export const getImplicitPrepareModules = ({
	operations,
}: {
	operations: Operations | null | undefined;
}): ImplicitPrepInstance[] => {
	const modulesByKey = new Map<string, ImplicitPrepInstance>();
	const updatePlanOps: { opIndex: number; op: UpdatePlanOp }[] = [];

	for (const [opIndex, op] of (operations?.customer ?? []).entries()) {
		if (
			op.type !== "update_plan" ||
			!(
				(op.customize?.price !== undefined && op.customize.price !== null) ||
				(op.customize?.add_items?.length ?? 0) > 0
			)
		) {
			continue;
		}

		updatePlanOps.push({ opIndex, op });
	}

	if (updatePlanOps.length > 0) {
		const key = buildPrepareModuleKey({
			kind: ensurePricesAndEntitlementsModule.kind,
			parts: ["update_plan"],
		});
		modulesByKey.set(key, {
			key,
			module: ensurePricesAndEntitlementsModule,
			input: {
				updatePlanOps,
			},
		});
	}

	return Array.from(modulesByKey.values());
};
