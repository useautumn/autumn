import {
	customerEntitlementRepo,
	customerProductRepo,
	customerRepo,
	entitlementRepo,
	featureRepo,
	productRepo,
} from "@autumn/postgres";
import { type AppEnv, CustomerNotFoundError } from "@autumn/shared";
import type { ShardContext } from "../../shard/types/shardContext.js";
import { subjectToKey } from "../subjectToKey.js";
import type { SubjectImport } from "../types/subjectImport.js";

const distinct = (values: string[]): string[] => [...new Set(values)];

// First sight of a customer in this shard: the Postgres reads that seed subject
// state. Fetch only — the rows are written between writer-loop transactions.
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
	const [customerProducts, customerEntitlements, features] = await Promise.all([
		customerProductRepo.listByInternalCustomerId({ db, internalCustomerId }),
		customerEntitlementRepo.listRowsByInternalCustomerId({
			db,
			internalCustomerId,
		}),
		featureRepo.listByOrgEnv({ db, orgId, env }),
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
		customers: [customer],
		customerProducts,
		customerEntitlements,
		entitlements,
		features,
		products,
	};
};
