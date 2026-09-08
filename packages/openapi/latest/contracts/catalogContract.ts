import {
	GetCatalogParamsSchema,
	GetCatalogResponseSchema,
	PreviewUpdateCatalogParamsSchema,
	PreviewUpdateCatalogResponseSchema,
	UpdateCatalogParamsSchema,
	UpdateCatalogResponseSchema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";

/**
 * catalogV2 — INTERNAL ONLY. These contracts are registered on
 * `v2_3InternalContractRouter`, never the public one, so they reach
 * `openapi-internal.yml` (which the atmn generator reads) and stay out of the
 * published spec, the SDKs and the docs.
 *
 * catalogV2 is slated to replace the legacy catalog endpoint in place, so
 * publishing it now would widen the blast radius of that swap.
 */

export const catalogV2GetContract = oc
	.route({
		method: "POST",
		path: "/v1/catalogV2.get",
		operationId: "getCatalogV2",
		tags: ["catalog"],
		description: "Read the whole catalog — every plan version and feature.",
	})
	.input(GetCatalogParamsSchema.meta({ title: "GetCatalogParams" }))
	.output(GetCatalogResponseSchema.meta({ title: "GetCatalogResponse" }));

export const catalogV2PreviewUpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/catalogV2.preview_update",
		operationId: "previewUpdateCatalogV2",
		tags: ["catalog"],
		description:
			"Resolve a proposed catalog change without persisting. Takes the exact params catalogV2.update takes.",
	})
	.input(
		PreviewUpdateCatalogParamsSchema.meta({
			title: "PreviewUpdateCatalogParams",
		}),
	)
	.output(
		PreviewUpdateCatalogResponseSchema.meta({
			title: "PreviewUpdateCatalogResponse",
		}),
	);

export const catalogV2UpdateContract = oc
	.route({
		method: "POST",
		path: "/v1/catalogV2.update",
		operationId: "updateCatalogV2",
		tags: ["catalog"],
		description:
			"Apply a catalog change. With skip_deletions false the payload is the complete desired catalog.",
	})
	.input(UpdateCatalogParamsSchema.meta({ title: "UpdateCatalogParams" }))
	.output(UpdateCatalogResponseSchema.meta({ title: "UpdateCatalogResponse" }));
