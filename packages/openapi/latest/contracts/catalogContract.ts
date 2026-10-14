import {
	GetCatalogParamsSchema,
	GetCatalogResponseSchema,
	PreviewUpdateCatalogParamsSchema,
	PreviewUpdateCatalogResponseSchema,
	UpdateCatalogParamsSchema,
	UpdateCatalogResponseSchema,
} from "@autumn/shared";
import { oc } from "@orpc/contract";

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

export const catalogV2DiffContract = oc
	.route({
		method: "POST",
		path: "/v1/catalogV2.diff",
		operationId: "diffCatalogV2",
		tags: ["catalog"],
		description:
			"Compute a catalog delta without mutation validation or persistence.",
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
