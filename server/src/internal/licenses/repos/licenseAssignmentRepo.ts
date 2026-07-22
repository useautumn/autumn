import {
	ACTIVE_STATUSES,
	CusProductStatus,
	customerLicenses,
	customerProducts,
	type DbCustomerProduct,
	entities,
	products,
} from "@autumn/shared";
import {
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type DbLicenseAssignment = DbCustomerProduct;

const assignmentConditions = () => [
	isNotNull(customerProducts.customer_license_link_id),
	isNotNull(customerProducts.internal_entity_id),
];

export const activeAssignmentConditions = () => [
	...assignmentConditions(),
	inArray(customerProducts.status, ACTIVE_STATUSES),
];

/** SQL predicate excluding every seat row, including released seats whose
 * entity link has been cleared while awaiting reuse. */
export const notLicenseAssignmentSql = (alias: string) =>
	`${alias}.customer_license_link_id IS NULL`;

const listAssignmentsWithEntityAndProductByCustomer = async ({
	db,
	internalCustomerId,
	entityId,
	licenseInternalProductId,
	parentCustomerProductId,
	activeOnly = true,
}: {
	db: DrizzleCli;
	internalCustomerId?: string;
	entityId?: string;
	licenseInternalProductId?: string;
	parentCustomerProductId?: string;
	activeOnly?: boolean;
}) =>
	await db
		.select({
			assignment: customerProducts,
			entity_id: entities.id,
			license_product_id: products.id,
		})
		.from(customerProducts)
		.innerJoin(
			entities,
			eq(customerProducts.internal_entity_id, entities.internal_id),
		)
		.innerJoin(
			products,
			eq(customerProducts.internal_product_id, products.internal_id),
		)
		.where(
			and(
				...(internalCustomerId
					? [eq(customerProducts.internal_customer_id, internalCustomerId)]
					: []),
				...assignmentConditions(),
				...(activeOnly
					? [inArray(customerProducts.status, ACTIVE_STATUSES)]
					: []),
				...(entityId ? [eq(entities.id, entityId)] : []),
				...(licenseInternalProductId
					? [eq(customerProducts.internal_product_id, licenseInternalProductId)]
					: []),
				...(parentCustomerProductId
					? [
							// Seats anchor by link; the pool row carries the parent.
							inArray(
								customerProducts.customer_license_link_id,
								db
									.select({ link_id: customerLicenses.link_id })
									.from(customerLicenses)
									.where(
										eq(
											customerLicenses.parent_customer_product_id,
											parentCustomerProductId,
										),
									),
							),
						]
					: []),
			),
		);

/** Released seats waiting for reuse, longest-released first. */
const listUnusedAssignmentsByLinkId = async ({
	db,
	customerLicenseLinkId,
	limit,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	limit: number;
}): Promise<DbLicenseAssignment[]> =>
	await db.query.customerProducts.findMany({
		where: and(
			eq(customerProducts.customer_license_link_id, customerLicenseLinkId),
			isNull(customerProducts.internal_entity_id),
			inArray(customerProducts.status, ACTIVE_STATUSES),
		),
		orderBy: asc(customerProducts.released_at),
		limit,
	});

const listActiveAssignmentsByInternalEntityId = async ({
	db,
	internalEntityId,
}: {
	db: DrizzleCli;
	internalEntityId: string;
}): Promise<DbLicenseAssignment[]> =>
	await db.query.customerProducts.findMany({
		where: and(
			eq(customerProducts.internal_entity_id, internalEntityId),
			...activeAssignmentConditions(),
		),
	});

/** Ends active seats anchored to no surviving pool link (unstamped or
 * dangling) — one set-based UPDATE per reconcile. */
const expireOrphanAssignments = async ({
	db,
	internalCustomerId,
	validCustomerLicenseLinkIds,
	endedAt,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	validCustomerLicenseLinkIds: string[];
	endedAt: number;
}) => {
	await db
		.update(customerProducts)
		.set({ status: CusProductStatus.Expired, ended_at: endedAt })
		.where(
			and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				...activeAssignmentConditions(),
				or(
					isNull(customerProducts.customer_license_link_id),
					...(validCustomerLicenseLinkIds.length > 0
						? [
								notInArray(
									customerProducts.customer_license_link_id,
									validCustomerLicenseLinkIds,
								),
							]
						: []),
				),
			),
		);
};

/** Ends released spare seats (entity-less rows awaiting reuse) on the given
 * pool links — spares can never rebind while a pool is over capacity. */
const expireUnusedAssignmentsByLinkIds = async ({
	db,
	customerLicenseLinkIds,
	endedAt,
}: {
	db: DrizzleCli;
	customerLicenseLinkIds: string[];
	endedAt: number;
}) => {
	if (customerLicenseLinkIds.length === 0) return;
	await db
		.update(customerProducts)
		.set({ status: CusProductStatus.Expired, ended_at: endedAt })
		.where(
			and(
				inArray(
					customerProducts.customer_license_link_id,
					customerLicenseLinkIds,
				),
				isNull(customerProducts.internal_entity_id),
				inArray(customerProducts.status, ACTIVE_STATUSES),
			),
		);
};

/** Seats are grouped through their customer license — the seat's own parent
 * column goes stale on reparent; the customer license's never does. */
const maxActiveCountByCatalogLink = async ({
	db,
	parentInternalProductId,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	parentInternalProductId: string;
	licenseInternalProductId: string;
}): Promise<number> => {
	const parent = db
		.select({ id: customerProducts.id })
		.from(customerProducts)
		.where(eq(customerProducts.internal_product_id, parentInternalProductId))
		.as("license_parents");
	const [row] = await db
		.select({ value: count() })
		.from(customerProducts)
		.innerJoin(
			customerLicenses,
			eq(customerProducts.customer_license_link_id, customerLicenses.link_id),
		)
		.innerJoin(
			parent,
			eq(customerLicenses.parent_customer_product_id, parent.id),
		)
		.where(
			and(
				eq(
					customerLicenses.license_internal_product_id,
					licenseInternalProductId,
				),
				...activeAssignmentConditions(),
			),
		)
		.groupBy(customerProducts.customer_license_link_id)
		.orderBy(desc(count()))
		.limit(1);
	return row?.value ?? 0;
};

/** node-postgres exposes rowCount; postgres-js exposes count. */
const affectedRows = (result: unknown): number => {
	const shaped = result as { rowCount?: number; count?: number };
	return shaped.rowCount ?? shaped.count ?? 0;
};

const repointSeatPrices = async ({
	db,
	customerLicenseLinkId,
	fromPriceId,
	toPriceId,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	fromPriceId: string;
	toPriceId: string;
}): Promise<number> => {
	const result = await db.execute(sql`
		UPDATE customer_prices AS customer_price
		SET price_id = ${toPriceId}
		FROM customer_products AS seat
		WHERE customer_price.customer_product_id = seat.id
			AND seat.customer_license_link_id = ${customerLicenseLinkId}
			AND seat.internal_entity_id IS NOT NULL
			AND seat.status IN ${sql.raw(`('${ACTIVE_STATUSES.join("','")}')`)}
			AND customer_price.price_id = ${fromPriceId}
	`);
	return affectedRows(result);
};

export const licenseAssignmentRepo = {
	listAssignmentsWithEntityAndProductByCustomer,
	listActiveAssignmentsByInternalEntityId,
	listUnusedAssignmentsByLinkId,
	expireOrphanAssignments,
	expireUnusedAssignmentsByLinkIds,
	maxActiveCountByCatalogLink,
	repointSeatPrices,
} as const;
