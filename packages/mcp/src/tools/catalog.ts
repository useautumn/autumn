import { CatalogUpdateParamsSchema } from "@autumn/shared/publicApiSchemas";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const endpoints = {
	previewUpdateCatalog: "/v1/catalog.preview_update",
	updateCatalog: "/v1/catalog.update",
} as const;

const schemas = {
	previewUpdateCatalog: CatalogUpdateParamsSchema,
	updateCatalog: CatalogUpdateParamsSchema,
} as const;

const { operation } = createDomainTools({ endpoints, schemas });

const domain = {
	operations: [
		operation({
			id: "previewUpdateCatalog",
			description:
				"Preview a batch catalog change (features + plans) WITHOUT applying it. Returns each plan resolved to the latest plan shape plus impact (will_version, has_customers, migration_draft), and each feature resolved plus any blockers that would reject the update. Check feature blockers before calling updateCatalog so you don't attempt an update the server will reject. Use to show the user a live preview while iterating on pricing; pass the same params you would pass to updateCatalog.",
		}),
		operation({
			id: "updateCatalog",
			description:
				"Apply a batch catalog change (create/update features and plans) in one call. Destructive configuration write: preview with previewUpdateCatalog first. Plans upsert by plan_id; set disable_version per plan per Plan Management; set create_migration to also create (not run) a migration draft for in-place changes to plans that have customers. Follow Plan Management and Concepts.",
			destructive: true,
		}),
	],
} satisfies ToolDomain;

export const catalog = { endpoints, schemas, domain };
