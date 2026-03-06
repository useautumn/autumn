import {
	AffectedResource,
	CreateVariantParamsSchema,
	type Product,
	ProductAlreadyExistsError,
	ProductNotFoundError,
	products,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { generateId } from "@/utils/genUtils.js";
import { ProductService } from "../../ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleCreateVariant = createRoute({
	body: CreateVariantParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		const { db, org, env, features } = ctx;

		// 1. Fetch parent plan
		const parent = await ProductService.getFull({
			db,
			idOrInternalId: body.plan_id,
			orgId: org.id,
			env,
			allowNotFound: true,
		});

		if (!parent) {
			throw new ProductNotFoundError({ productId: body.plan_id });
		}

		// 2. Check variant_id uniqueness
		const existing = await db.query.products.findFirst({
			where: and(
				eq(products.org_id, org.id),
				eq(products.env, env),
				eq(products.internal_parent_product_id, parent.internal_id),
				eq(products.variant_id, body.variant_id),
			),
		});

		if (existing) {
			throw new ProductAlreadyExistsError({
				productId: `${body.plan_id}/${body.variant_id}`,
			});
		}

		// 3. Insert the new variant product row (no items yet)
		const newProduct: Product = {
			id: parent.id,
			name: body.variant_name,
			description: parent.description ?? null,
			is_add_on: parent.is_add_on,
			is_default: parent.is_default,
			version: parent.version,
			minor_version: 1,
			group: parent.group,
			env,
			internal_id: generateId("prod"),
			org_id: org.id,
			created_at: Date.now(),
			processor: parent.processor ?? undefined,
			internal_parent_product_id: parent.internal_id,
			variant_id: body.variant_id,
			archived: false,
		};

		await ProductService.insert({ db, product: newProduct });

		// 4. Re-fetch via getVariant and return
		const fullVariant = await ProductService.getVariant({
			db,
			planId: parent.id,
			variantId: body.variant_id,
			orgId: org.id,
			env,
		});

		const plan = await getPlanResponse({
			product: fullVariant,
			features,
		});

		return c.json(plan);
	},
});
