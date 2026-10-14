import { type AppEnv, type ProductMetadata, products } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { listStripeReuseFamilyIds } from "./listStripeReuseFamilyIds.js";

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
	listStripeReuseFamilyIds,
	updateMetadataByExternalId,
} as const;
