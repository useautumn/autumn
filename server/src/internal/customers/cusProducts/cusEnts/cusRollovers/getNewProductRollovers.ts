import type {
	CustomerEntitlement,
	EntitlementWithFeature,
	FullCusProduct,
	FullCustomerEntitlement,
	Rollover,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

export const getNewProductRollovers = async ({
	curCusProduct,
	cusEnts: newCusEnts,
	entitlements,
	db,
	logger,
}: {
	curCusProduct: FullCusProduct;
	cusEnts: CustomerEntitlement[];
	entitlements: EntitlementWithFeature[];
	db: DrizzleCli;
	logger: any;
}) => {
	if (!curCusProduct) return [];
	if (!curCusProduct.id) return [];
	try {
		const rolloverOperations: {
			// rolloverConfig: RolloverConfig;
			toInsert: Rollover[];
			cusEnt: FullCustomerEntitlement;
			// cusEntId: string;
			// toUpdate: Rollover[];
			// entityMode: boolean;
		}[] = [];

		// let newRollovers: Rollover[] = [];

		const oldCusEnts = curCusProduct.customer_entitlements;

		for (const newCusEnt of newCusEnts) {
			const newRollovers: Rollover[] = [];
			const newEnt = entitlements.find(
				(e) => e.id === newCusEnt.entitlement_id,
			);
			const oldCusEnt = oldCusEnts.find(
				(e) =>
					e.entitlement.internal_feature_id === newEnt?.internal_feature_id,
			);
			const oldEnt = oldCusEnt?.entitlement;

			if (!oldCusEnt || !newEnt?.rollover) continue;

			// Do not handle case where user is upgrading from non-entity to entity or vice versa
			if (newEnt?.entity_feature_id && !oldEnt?.entity_feature_id) {
				continue;
			}
			if (!newEnt?.entity_feature_id && oldEnt?.entity_feature_id) {
				continue;
			}

			const curRollovers = oldCusEnt.rollovers;

			for (const curRollover of curRollovers) {
				newRollovers.push({
					...curRollover,
					id: generateId("roll"),
					cus_ent_id: newCusEnt.id,
				});
			}

			// // Add this entitlement's rollover operations
			rolloverOperations.push({
				toInsert: newRollovers,
				cusEnt: {
					...newCusEnt,
					entitlement: newEnt,
					rollovers: [],
					replaceables: [],
				},
			});
		}

		return rolloverOperations;
	} catch (error) {
		logger.error(`Failed to handle new product rollovers:`, {
			error,
		});
		return [];
	}
};
