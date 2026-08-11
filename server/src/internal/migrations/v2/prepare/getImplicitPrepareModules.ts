import type { Operations } from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { ensurePlanLicenses } from "./modules/ensurePlanLicenses/ensurePlanLicenses.js";
import type { ensurePricesAndEntitlements } from "./modules/ensurePricesAndEntitlements/index.js";
import { ensurePricesAndEntitlements as ensurePricesAndEntitlementsModule } from "./modules/ensurePricesAndEntitlements/index.js";
import type { PrepareModule } from "./types/prepareModule.js";
import { buildPrepareModuleKey } from "./utils/index.js";

/** One instance of a prep module to run, with `module` and `input` correlated
 * per member — building the pair separately would let them drift apart. */
type InstanceOf<Module> = Module extends PrepareModule<
	infer Input,
	infer _Result,
	string
>
	? { key: string; module: Module; input: Input }
	: never;

export type ImplicitPrepInstance =
	| InstanceOf<typeof ensurePricesAndEntitlements>
	| InstanceOf<typeof ensurePlanLicenses>;

/** The union with its per-member correlation erased. The orchestrator runs
 * every member the same way and is blind to result shapes by design. */
export type PrepInstance = {
	key: string;
	module: PrepareModule<unknown, unknown>;
	input: unknown;
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
	const licenseOps: { opIndex: number; op: UpdatePlanOp }[] = [];

	for (const [opIndex, op] of (operations?.customer ?? []).entries()) {
		if (op.type !== "update_plan") continue;

		if (
			(op.customize?.price !== undefined && op.customize.price !== null) ||
			(op.customize?.add_items?.length ?? 0) > 0
		) {
			updatePlanOps.push({ opIndex, op });
		}

		if (
			(op.customize?.upsert_licenses ?? []).some(
				(entry) =>
					(entry.customize?.add_items?.length ?? 0) > 0 ||
					(entry.customize?.remove_items?.length ?? 0) > 0,
			)
		) {
			licenseOps.push({ opIndex, op });
		}
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

	if (licenseOps.length > 0) {
		const key = buildPrepareModuleKey({
			kind: ensurePlanLicenses.kind,
			parts: ["update_plan"],
		});
		modulesByKey.set(key, {
			key,
			module: ensurePlanLicenses,
			input: { updatePlanOps: licenseOps },
		});
	}

	return Array.from(modulesByKey.values());
};
