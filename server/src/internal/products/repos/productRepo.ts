import { type AppEnv, type ProductMetadata, products } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

// Fans the write out to every version row (no stable cross-version id); `id`
// must be the plan's current external id.
const updateMetadataByExternalId = async ({
	db,
	orgId,
	env,
	id,
	metadata,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	id: string;
	metadata: ProductMetadata;
}) =>
	db
		.update(products)
		.set({ metadata })
		.where(
			and(
				eq(products.org_id, orgId),
				eq(products.env, env),
				eq(products.id, id),
			),
		);

export const productRepo = {
	updateMetadataByExternalId,
} as const;
