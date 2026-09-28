import {
	type CatalogRow,
	createSubjectState,
	type MeteringIdentity,
	type SubjectState,
} from "@autumn/balance-engine";
import {
	createCatalogRowsFor,
	createCustomerEntitlement,
	createCustomerProduct,
	testIdentity,
} from "../../fixtures/mutations.js";

export type Scenario = {
	name: string;
	features: string[];
	stateFor(params: { identity: MeteringIdentity }): SubjectState;
	catalogRows: CatalogRow[];
};

const FAR_FUTURE = 4_000_000_000_000;

/** A customer holding `products` plans, each granting every feature once: one ent row per (plan, feature). */
const buildScenario = ({
	name,
	products,
	features,
}: {
	name: string;
	products: number;
	features: number;
}): Scenario => {
	const featureIds = Array.from({ length: features }, (_, i) => `feature_${i}`);
	const stateFor = ({ identity }: { identity: MeteringIdentity }) =>
		createSubjectState({
			identity,
			customerProducts: Array.from({ length: products }, (_, p) =>
				createCustomerProduct({ id: `cp_${p}` }),
			),
			customerEntitlements: Array.from({ length: products }).flatMap((_, p) =>
				featureIds.map((featureId) => ({
					...createCustomerEntitlement({
						id: `ce_${p}_${featureId}`,
						featureId,
						balance: 1_000_000_000,
					}),
					customer_product_id: `cp_${p}`,
					next_reset_at: FAR_FUTURE,
				})),
			),
		});
	return {
		name,
		features: featureIds,
		stateFor,
		catalogRows: createCatalogRowsFor({
			state: stateFor({ identity: testIdentity }),
		}),
	};
};

export const scenarios: Record<string, Scenario> = {
	small: buildScenario({ name: "small", products: 1, features: 1 }),
	typical: buildScenario({ name: "typical", products: 2, features: 6 }),
	heavy: buildScenario({ name: "heavy", products: 4, features: 15 }),
};
