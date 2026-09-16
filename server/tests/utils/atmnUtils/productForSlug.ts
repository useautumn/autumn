import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** The row a config addresses: version numbers follow creation order, slugs are what the fixture states. */
export const productForSlug = async ({
	ctx,
	planId,
	versionSlug,
}: {
	ctx: AutumnContext;
	planId: string;
	versionSlug: string;
}): Promise<FullProduct> => {
	const rows = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
	});
	const row = rows.find((product) => product.version_slug === versionSlug);
	if (!row) {
		throw new Error(
			`${planId}@${versionSlug} not found; have ${rows.map((r) => r.version_slug).join(", ")}`,
		);
	}
	return row;
};
