import { customerProducts, customers, entities } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { ResetEligibleCustomerEntitlementRow } from "@/internal/customers/cusProducts/cusEnts/repos/getResetEligibleCustomerEntitlementsPage.js";

/** Who a reset is addressed to: the customer, and the entity when the due row is the entity's own. */
export type ResetSubject = {
	internalCustomerId: string;
	customerId: string;
	orgId: string;
	env: string;
	internalEntityId: string | null;
	entityId: string | null;
};

const unique = (values: (string | null)[]): string[] => [
	...new Set(values.flatMap((value) => value ?? [])),
];

/** The entity behind each plan on the page: an entity plan's rows carry no entity of their own. */
const entityByPlanOf = async ({
	db,
	page,
}: {
	db: DrizzleCli;
	page: ResetEligibleCustomerEntitlementRow[];
}): Promise<Map<string, string | null>> => {
	const customerProductIds = unique(page.map((row) => row.customerProductId));
	if (customerProductIds.length === 0) return new Map();
	const rows = await db
		.select({
			id: customerProducts.id,
			internalEntityId: customerProducts.internal_entity_id,
		})
		.from(customerProducts)
		.where(inArray(customerProducts.id, customerProductIds));
	return new Map(rows.map((row) => [row.id, row.internalEntityId ?? null]));
};

/** One subject per distinct (customer, entity) behind the page's rows; rows whose customer or entity can't be addressed are left to the SQL lane. */
export const getResetSubjects = async ({
	db,
	page,
}: {
	db: DrizzleCli;
	page: ResetEligibleCustomerEntitlementRow[];
}): Promise<ResetSubject[]> => {
	if (page.length === 0) return [];
	const entityByPlan = await entityByPlanOf({ db, page });
	const internalEntityOf = (row: ResetEligibleCustomerEntitlementRow) =>
		row.internalEntityId ??
		(row.customerProductId ? entityByPlan.get(row.customerProductId) : null) ??
		null;

	const internalCustomerIds = unique(page.map((row) => row.internalCustomerId));
	const internalEntityIds = unique(page.map(internalEntityOf));
	const [customerRows, entityRows] = await Promise.all([
		db
			.select({
				internalId: customers.internal_id,
				id: customers.id,
				orgId: customers.org_id,
				env: customers.env,
			})
			.from(customers)
			.where(inArray(customers.internal_id, internalCustomerIds)),
		internalEntityIds.length === 0
			? Promise.resolve([])
			: db
					.select({ internalId: entities.internal_id, id: entities.id })
					.from(entities)
					.where(inArray(entities.internal_id, internalEntityIds)),
	]);
	const customerById = new Map(
		customerRows.map((row) => [row.internalId, row]),
	);
	const entityById = new Map(entityRows.map((row) => [row.internalId, row]));

	const subjects = new Map<string, ResetSubject>();
	for (const row of page) {
		const customer = customerById.get(row.internalCustomerId);
		if (!customer || customer.id === null || customer.env === null) continue;
		const internalEntityId = internalEntityOf(row);
		const entity = internalEntityId
			? entityById.get(internalEntityId)
			: undefined;
		if (internalEntityId && (!entity || entity.id === null)) continue;
		const key = `${customer.internalId}:${internalEntityId ?? ""}`;
		if (subjects.has(key)) continue;
		subjects.set(key, {
			internalCustomerId: customer.internalId,
			customerId: customer.id,
			orgId: customer.orgId,
			env: customer.env,
			internalEntityId,
			entityId: entity?.id ?? null,
		});
	}
	return [...subjects.values()];
};
