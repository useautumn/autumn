import {
	AppEnv,
	BillingInterval,
	PriceSchema,
	PriceType,
	ProcessorType,
	ProductSchema,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { generateId } from "@/utils/genUtils.js";

export const createOAuthCatalogFixture = async ({
	ctx,
}: {
	ctx: TestContext;
}) => {
	for (const env of [AppEnv.Sandbox, AppEnv.Live]) {
		const internalId = generateId("prod");
		await ProductService.insert({
			db: ctx.db,
			product: ProductSchema.parse({
				id: "oauth-mapped-plan",
				internal_id: internalId,
				org_id: ctx.org.id,
				env,
				name: "OAuth mapped plan",
				description: null,
				is_add_on: false,
				is_default: false,
				version: 1,
				active: true,
				group: "",
				created_at: Date.now(),
				base_variant_id: null,
				processor: { type: ProcessorType.Stripe, id: `prod_oauth_${env}` },
			}),
		});
		await PriceService.insert({
			db: ctx.db,
			data: PriceSchema.parse({
				id: generateId("price"),
				internal_product_id: internalId,
				org_id: ctx.org.id,
				created_at: Date.now(),
				proration_config: null,
				config: {
					type: PriceType.Fixed,
					amount: 10,
					interval: BillingInterval.Month,
					stripe_price_id: `price_oauth_${env}`,
				},
			}),
		});
		await invalidateProductsCache({ orgId: ctx.org.id, env });
		await ProductService.listFull({ db: ctx.db, orgId: ctx.org.id, env });
	}
};
