import {
	PreviewUpdateOrganizationParamsSchema,
	PreviewUpdateOrganizationResponseSchema,
	UpdateOrganizationParamsSchema,
	UpdateOrganizationResponseSchema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";

/**
 * organization.* — INTERNAL ONLY, like catalogV2: registered on
 * `v2_3InternalContractRouter` so the atmn generator sees it and the
 * published spec, SDKs and docs do not.
 */

export const organizationPreviewUpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/organization.preview_update",
		operationId: "previewUpdateOrganization",
		tags: ["organization"],
		description:
			"What organization.update would change, without persisting. Takes the exact params organization.update takes.",
	})
	.input(
		PreviewUpdateOrganizationParamsSchema.meta({
			title: "PreviewUpdateOrganizationParams",
		}),
	)
	.output(
		PreviewUpdateOrganizationResponseSchema.meta({
			title: "PreviewUpdateOrganizationResponse",
		}),
	);

export const organizationUpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/organization.update",
		operationId: "updateOrganization",
		tags: ["organization"],
		description:
			"Set organization settings. Only the flags stated are written; every other flag keeps its value.",
	})
	.input(
		UpdateOrganizationParamsSchema.meta({ title: "UpdateOrganizationParams" }),
	)
	.output(
		UpdateOrganizationResponseSchema.meta({
			title: "UpdateOrganizationResponse",
		}),
	);
