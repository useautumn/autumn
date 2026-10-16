import { expect } from "bun:test";
import {
	balanceLocks,
	customerEntitlements,
	customerProducts,
	customers,
	entities,
} from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { and, eq } from "drizzle-orm";

/** One balance row in Postgres: its feature, the entity it belongs to (null for the customer), and its balances. */
export type PostgresBalanceRow = {
	featureId: string | null;
	entityId: string | null;
	balance: number;
	/** The per-entity balances of an entityFeatureId row, keyed by entity id; null on any other row. */
	entities: Record<string, number> | null;
};

export type PostgresEntityBalances = {
	balances: PostgresBalanceRow[];
	openLocks: { lockId: string; entityId: string | null; featureId: string }[];
};

const rowKey = (row: PostgresBalanceRow) =>
	JSON.stringify([row.featureId, row.entityId, row.entities !== null]);

/** Every balance Autumn holds for the customer in Postgres, per feature and entity, and the locks still open on it. */
export const postgresEntityBalancesOf = async ({
	customerId,
}: {
	customerId: string;
}): Promise<PostgresEntityBalances> => {
	const ofCustomer = and(
		eq(customers.org_id, defaultCtx.org.id),
		eq(customers.env, defaultCtx.env),
		eq(customers.id, customerId),
	);
	const [rows, customerEntities, locks] = await Promise.all([
		defaultCtx.db
			.select({
				featureId: customerEntitlements.feature_id,
				internalEntityId: customerEntitlements.internal_entity_id,
				productEntityId: customerProducts.internal_entity_id,
				balance: customerEntitlements.balance,
				entities: customerEntitlements.entities,
			})
			.from(customerEntitlements)
			.innerJoin(
				customers,
				eq(customers.internal_id, customerEntitlements.internal_customer_id),
			)
			.leftJoin(
				customerProducts,
				eq(customerProducts.id, customerEntitlements.customer_product_id),
			)
			.where(ofCustomer),
		defaultCtx.db
			.select({ id: entities.id, internalId: entities.internal_id })
			.from(entities)
			.innerJoin(
				customers,
				eq(customers.internal_id, entities.internal_customer_id),
			)
			.where(ofCustomer),
		defaultCtx.db
			.select({
				lockId: balanceLocks.lock_id,
				entityId: balanceLocks.entity_id,
				featureId: balanceLocks.feature_id,
			})
			.from(balanceLocks)
			.where(
				and(
					eq(balanceLocks.org_id, defaultCtx.org.id),
					eq(balanceLocks.env, defaultCtx.env),
					eq(balanceLocks.customer_id, customerId),
				),
			),
	]);
	const entityIdOf = (key: string | null) =>
		customerEntities.find(({ internalId }) => internalId === key)?.id ?? key;
	const balances = rows
		.map(
			(row): PostgresBalanceRow => ({
				featureId: row.featureId,
				// A plan attached to an entity scopes its rows through the customer product, not the row itself.
				entityId: entityIdOf(row.internalEntityId ?? row.productEntityId),
				balance: row.balance,
				entities: row.entities
					? Object.fromEntries(
							Object.entries(row.entities).map(([key, entity]) => [
								entityIdOf(key),
								entity.balance ?? 0,
							]),
						)
					: null,
			}),
		)
		.sort((left, right) => rowKey(left).localeCompare(rowKey(right)));
	return {
		balances,
		openLocks: locks.sort((left, right) =>
			left.lockId.localeCompare(right.lockId),
		),
	};
};

/** Read with the customer's id in its lock ids as `as`, so two customers set up alike compare equal. */
const postgresEntityBalancesAs = async ({
	customerId,
	as,
}: {
	customerId: string;
	as: string;
}) =>
	JSON.parse(
		JSON.stringify(await postgresEntityBalancesOf({ customerId })).replaceAll(
			customerId,
			as,
		),
	) as PostgresEntityBalances;

/** The Atom's customer settles in Postgres on exactly what the API's customer holds: every balance, per entity, and every open lock. */
export const expectPostgresBalancesEqual = async ({
	apiCustomerId,
	atomCustomerId,
	openLocks,
}: {
	apiCustomerId: string;
	atomCustomerId: string;
	/** Lock ids (as the API's customer names them) still open on both; none when omitted. */
	openLocks?: string[];
}): Promise<PostgresEntityBalances> => {
	const { api } = await pollUntilAsserted({
		fetch: async () => ({
			api: await postgresEntityBalancesOf({ customerId: apiCustomerId }),
			atom: await postgresEntityBalancesAs({
				customerId: atomCustomerId,
				as: apiCustomerId,
			}),
		}),
		assert: ({ api, atom }) => {
			expect(api.openLocks.map(({ lockId }) => lockId)).toEqual(
				openLocks ?? [],
			);
			expect(atom).toEqual(api);
		},
	});
	return api;
};
