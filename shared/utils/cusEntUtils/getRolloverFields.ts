import type { FullCustomerEntitlementView } from "@models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { notNullish } from "@utils/utils.js";

type CusRolloverInfo = {
	balance: number;
	usage: number;
	expires_at: number | null;
};
interface RolloverFields {
	balance: number;
	usage: number;
	rollovers: CusRolloverInfo[];
}
export const getRolloverFields = ({
	cusEnt,
	entityId,
}: {
	cusEnt: Pick<FullCustomerEntitlementView, "entitlement" | "rollovers">;
	entityId?: string;
}): RolloverFields | undefined => {
	const hasRollover = notNullish(cusEnt.entitlement.rollover);
	if (!hasRollover) return;

	const rollovers = cusEnt.rollovers || [];

	if (cusEnt.entitlement.entity_feature_id) {
		if (entityId) {
			return rollovers.reduce(
				(acc: RolloverFields, rollover) => {
					const entityRollover = rollover.entities?.[entityId];
					if (entityRollover) {
						return {
							balance: acc.balance + entityRollover.balance,
							usage: acc.usage + entityRollover.usage,
							rollovers: [
								...acc.rollovers,
								{
									balance: entityRollover.balance,
									usage: entityRollover.usage,
									expires_at: rollover.expires_at,
								},
							],
						};
					}
					return acc;
				},
				{
					balance: 0,
					usage: 0,
					rollovers: [] as CusRolloverInfo[],
				},
			);
		} else {
			return rollovers.reduce(
				(acc: RolloverFields, rollover) => {
					let newBalance = 0;
					let newUsage = 0;

					for (const entityRollover of Object.values(rollover.entities ?? {})) {
						newBalance += entityRollover.balance;
						newUsage += entityRollover.usage;
					}

					return {
						balance: acc.balance + newBalance,
						usage: acc.usage + newUsage,
						rollovers: [
							...acc.rollovers,
							{
								balance: newBalance,
								usage: newUsage,
								expires_at: rollover.expires_at,
							},
						],
					};
				},
				{
					balance: 0,
					usage: 0,
					rollovers: [] as CusRolloverInfo[],
				},
			);
		}
	} else {
		return rollovers.reduce(
			(acc: RolloverFields, rollover) => {
				return {
					balance: acc.balance + rollover.balance,
					usage: acc.usage + rollover.usage,
					rollovers: [
						...acc.rollovers,
						{
							balance: rollover.balance,
							usage: rollover.usage,
							expires_at: rollover.expires_at,
						},
					],
				};
			},
			{
				balance: 0,
				usage: 0,
				rollovers: [] as CusRolloverInfo[],
			},
		);
	}
};
