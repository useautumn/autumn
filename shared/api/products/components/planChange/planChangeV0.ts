import {
	CustomizePlanLicenseSchema,
	RemovePlanLicenseSchema,
} from "@models/licenseModels/licenseModels.js";
import { DiffedCustomizePlanV1Schema } from "@utils/planV1Utils/diff/diffPlanV1.js";
import { z } from "zod/v4";
import {
	PlanChangeCoreV0Schema,
	PlanFreeTrialChangeV0Schema,
	PlanPriceChangeV0Schema,
} from "./planChangeCoreV0.js";
import { PlanLicenseChangeV0Schema } from "./planLicenseChangeV0.js";

export {
	type PlanChangeCoreV0,
	PlanChangeCoreV0Schema,
	type PlanFreeTrialChangeV0,
	PlanFreeTrialChangeV0Schema,
	type PlanPriceChangeV0,
	PlanPriceChangeV0Schema,
} from "./planChangeCoreV0.js";

/** Core customize plus the license call. Zod content schema stays license-free. */
export const PlanChangeCustomizeV0Schema = DiffedCustomizePlanV1Schema.extend({
	upsert_licenses: z.array(CustomizePlanLicenseSchema).optional().meta({
		description:
			"planLicenses created or overridden. Same shape as customize.upsert_licenses / licenses[] entries.",
	}),
	remove_licenses: z.array(RemovePlanLicenseSchema).optional().meta({
		description: "planLicenses dropped from this plan.",
	}),
});

/**
 * Change to a plan definition (core content + one-layer licenses).
 * Shared kernel for catalog preview and (nested under) customer plan changes.
 */
export const PlanChangeV0Schema = PlanChangeCoreV0Schema.extend({
	license_changes: z.array(PlanLicenseChangeV0Schema).optional().meta({
		description:
			"planLicenses created, updated, or removed on this plan. Omitted when none. Nested plan_change is core-only.",
	}),
	customize: PlanChangeCustomizeV0Schema.optional().meta({
		description:
			"Params that would transform the previous plan into the current one, including license upserts/removes.",
	}),
});

export type PlanChangeCustomizeV0 = z.infer<typeof PlanChangeCustomizeV0Schema>;
export type PlanChangeV0 = z.infer<typeof PlanChangeV0Schema>;
