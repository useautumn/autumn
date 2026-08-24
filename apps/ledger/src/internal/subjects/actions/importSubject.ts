import {
	customerEntitlementRepo,
	customerProductRepo,
	customerRepo,
	entitlementRepo,
	featureRepo,
	ledgerSubjectVersionRepo,
	productRepo,
} from "@autumn/postgres";
import { type AppEnv, CustomerNotFoundError } from "@autumn/shared";
import type { ShardContext } from "../../shard/types/shardContext.js";
import { subjectToKey } from "../subjectToKey.js";
import type { SubjectImport } from "../types/subjectImport.js";

const FIRST_VERSION_SEED = 0;

const distinct = (values: string[]): string[] => [...new Set(values)];

// First sight of a customer in this shard: the Postgres reads that seed subject
// state. Fetch only — the rows are written between writer-loop transactions.
// Serials do not survive this: a re-import or restart forgets which commands it
// has already answered, until the journal tail is replayed on boot.
export const importSubject = async ({
	ctx,
	orgId,
	env,
	customerId,
}: {
	ctx: ShardContext;
	orgId: string;
	env: AppEnv;
	customerId: string;
}): Promise<SubjectImport> => {
	const db = ctx.postgres;
	const customer = await customerRepo.getByCustomerId({
		db,
		orgId,
		env,
		customerId,
	});
	if (!customer) throw new CustomerNotFoundError({ customerId });

	const internalCustomerId = customer.internal_id;
	const [customerProducts, customerEntitlements, features, projectedVersion] =
		await Promise.all([
			customerProductRepo.listByInternalCustomerId({ db, internalCustomerId }),
			customerEntitlementRepo.listRowsByInternalCustomerId({
				db,
				internalCustomerId,
			}),
			featureRepo.listByOrgEnv({ db, orgId, env }),
			ledgerSubjectVersionRepo.getVersion({ db, internalCustomerId }),
		]);

	const [entitlements, products] = await Promise.all([
		entitlementRepo.listByIds({
			db,
			ids: distinct(
				customerEntitlements.map(
					(customerEntitlement) => customerEntitlement.entitlement_id,
				),
			),
		}),
		productRepo.listByInternalIds({
			db,
			internalIds: distinct(
				customerProducts.map(
					(customerProduct) => customerProduct.internal_product_id,
				),
			),
		}),
	]);

	return {
		key: subjectToKey({ orgId, env, customerId }),
		internalCustomerId,
		// Continue the journal sequence where the projection left it, so versions
		// stay gapless across a restart.
		version: projectedVersion ?? FIRST_VERSION_SEED,
		customers: [customer],
		customerProducts,
		// Balances re-read from Postgres on every import: the ledger's own
		// balance continuity across restarts returns with the projection target.
		customerEntitlements,
		entitlements,
		features,
		products,
	};
};
