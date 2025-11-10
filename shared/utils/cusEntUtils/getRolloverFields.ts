import type { FullCustomerEntitlement } from "@models/cusProductModels/cusEntModels/cusEntModels.js";
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
	cusEnt: FullCustomerEntitlement;
	entityId?: string;
}): RolloverFields | undefined => {
	const hasRollover = notNullish(cusEnt.entitlement.rollover);
	if (!hasRollover) return;

	const rollovers = cusEnt.rollovers || [];

	if (cusEnt.entitlement.entity_feature_id) {
		if (entityId) {
			return rollovers.reduce(
				(acc: RolloverFields, rollover) => {
					if (rollover.entities[entityId]) {
						return {
							balance: acc.balance + rollover.entities[entityId].balance,
							usage: acc.usage + rollover.entities[entityId].usage,
							rollovers: [
								...acc.rollovers,
								{
									balance: rollover.entities[entityId].balance,
									usage: rollover.entities[entityId].usage,
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

					for (const entityId in rollover.entities) {
						newBalance += rollover.entities[entityId].balance;
						newUsage += rollover.entities[entityId].usage;
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
