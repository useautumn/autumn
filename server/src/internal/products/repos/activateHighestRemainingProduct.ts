import { type AppEnv, products } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type ProductWriteDb = {
	query: DrizzleCli["query"];
	delete: DrizzleCli["delete"];
	update: DrizzleCli["update"];
};

const samePlan = ({
	orgId,
	env,
	productId,
}: {
	orgId: string;
	env: AppEnv;
	productId: string;
}) =>
	and(
		eq(products.org_id, orgId),
		eq(products.env, env),
		eq(products.id, productId),
	);

/**
 * Point `active` at the highest non-archived version of this plan, if any.
 * Two statements: `unique_active_product` is not deferrable, so a one-row-flip can unique-violate.
 */
export const activateHighestRemainingProduct = async ({
	db,
	orgId,
	env,
	productId,
}: {
	db: ProductWriteDb;
	orgId: string;
	env: AppEnv;
	productId: string;
}): Promise<void> => {
	const nextId = sql`(
		SELECT internal_id
		FROM ${products}
		WHERE org_id = ${orgId}
			AND env = ${env}
			AND id = ${productId}
			AND archived = false
		ORDER BY version DESC
		LIMIT 1
	)`;

	await db
		.update(products)
		.set({ active: false })
		.where(
			and(
				samePlan({ orgId, env, productId }),
				eq(products.active, true),
				sql`${nextId} IS NOT NULL`,
				sql`${products.internal_id} IS DISTINCT FROM ${nextId}`,
			),
		);

	await db
		.update(products)
		.set({ active: true })
		.where(sql`${products.internal_id} = ${nextId}`);
};

export const deleteProductRowAndHandoffActive = async ({
	db,
	internalId,
	orgId,
	env,
}: {
	db: ProductWriteDb;
	internalId: string;
	orgId: string;
	env: AppEnv;
}): Promise<void> => {
	const row = await db.query.products.findFirst({
		where: and(
			eq(products.internal_id, internalId),
			eq(products.org_id, orgId),
			eq(products.env, env),
		),
		columns: { id: true, active: true },
	});

	await db
		.delete(products)
		.where(
			and(
				eq(products.internal_id, internalId),
				eq(products.org_id, orgId),
				eq(products.env, env),
			),
		);

	if (row?.active) {
		await activateHighestRemainingProduct({
			db,
			orgId,
			env,
			productId: row.id,
		});
	}
};
