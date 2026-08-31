import { LicenseCustomizeSchema } from "@models/licenseModels/licenseModels.js";
import { z } from "zod/v4";
import { ApiPlanV1Schema } from "./apiPlanV1.js";

export const ApiPlanLicenseV1Schema = z.object({
	license_plan_id: z.string().meta({
		description: "The plan offered as a license under this plan.",
	}),
	version: z.number().int().min(1).meta({
		description: "The exact license-plan version pinned by this link.",
	}),
	version_slug: z.string().optional().meta({
		description:
			"Version slug of the license-plan row this link points at.",
	}),
	included: z.number().meta({
		description:
			"Number of license assignments included with this plan for free.",
	}),
	prepaid_only: z.boolean().meta({
		internal: true,
		description:
			"Assignments are capped at the included quantity. Must be true for now; overflow billing (false) is not yet available.",
	}),
	customize: LicenseCustomizeSchema.optional().meta({
		internal: true,
		description: "The item and price diff applied to this parent-plan link.",
	}),
	plan: z.lazy(() => ApiPlanV1Schema).optional().meta({
		description:
			"The effective plan for this license link — the pinned version, with the link's customize applied. Present when license plans are expanded.",
	}),
});

export type ApiPlanLicenseV1 = z.infer<typeof ApiPlanLicenseV1Schema>;
