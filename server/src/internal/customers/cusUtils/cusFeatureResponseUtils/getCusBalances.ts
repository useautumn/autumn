import {
	type EntInterval,
	type EntitlementWithFeature,
	type Entity,
	FeatureType,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	getCusEntBalance,
	LegacyVersion,
	type Organization,
} from "@autumn/shared";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";

import { BREAK_API_VERSION } from "@/utils/constants.js";
import { notNullish, notNullOrUndefined } from "@/utils/genUtils.js";
import {
	getRelatedCusPrice,
	getResetBalance,
	getUnlimitedAndUsageAllowed,
} from "../../cusProducts/cusEnts/cusEntUtils.js";

export interface CusFeatureBalance {
	feature_id: string;
	unlimited?: boolean;
	interval?: EntInterval;
	balance?: number | null;
	total?: number | null;
	adjustment?: number | null;
	used?: number | null;
	unused?: number | null;
	next_reset_at?: number | null;
	allowance?: number | null;
	overage_allowed?: boolean | null;
}

export const getV1EntitlementsRes = ({
	org,
	cusEnt,
	isBoolean,
	unlimited,
	ent,
}: {
	org: Organization;
	cusEnt: FullCustomerEntitlement;
	isBoolean: boolean;
	unlimited: boolean;
	ent: EntitlementWithFeature;
}) => {
	const res: any = {
		feature_id: ent.feature.id,
		unlimited: isBoolean ? undefined : unlimited,
		interval: isBoolean || unlimited ? null : ent.interval || undefined,
		balance: isBoolean ? undefined : unlimited ? null : 0,
		total: isBoolean || unlimited ? undefined : 0,
		adjustment: isBoolean || unlimited ? undefined : 0,
		used: isBoolean ? undefined : unlimited ? null : 0,
		unused: 0,
	};

	if (org.config.api_version >= BREAK_API_VERSION) {
		res.next_reset_at =
			isBoolean || unlimited ? undefined : cusEnt.next_reset_at;
		res.allowance = isBoolean || unlimited ? undefined : 0;
		res.usage_limit = isBoolean || unlimited ? undefined : 0;
	}

	return res;
};

export const getRolloverFields = ({
	cusEnt,
	entityId,
}: {
	cusEnt: FullCustomerEntitlement;
	entityId?: string;
}) => {
	const hasRollover = notNullish(cusEnt.entitlement.rollover);
	if (!hasRollover) {
		return null;
	}

	const rollovers = cusEnt.rollovers || [];

	if (cusEnt.entitlement.entity_feature_id) {
		if (entityId) {
			return rollovers.reduce(
				(acc, rollover) => {
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
					rollovers: [] as any[],
				},
			);
		} else {
			return rollovers.reduce(
				(acc, rollover) => {
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
					rollovers: [] as any[],
				},
			);
		}
	} else {
		return rollovers.reduce(
			(acc, rollover) => {
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
				rollovers: [] as any[],
			},
		);
	}
};

// IMPORTANT FUNCTION
export const getCusBalances = async ({
	cusEntsWithCusProduct,
	cusPrices,
	org,
	entity,
	apiVersion,
}: {
	cusEntsWithCusProduct: (FullCustomerEntitlement & {
		customer_product: FullCusProduct;
	})[];
	cusPrices: FullCustomerPrice[];
	org: Organization;
	entity?: Entity;
	apiVersion: number;
}) => {
	const data: Record<string, any> = {};
	const features = cusEntsWithCusProduct.map(
		(cusEnt) => cusEnt.entitlement.feature,
	);
	const cusEntsFiltered = cusEntsWithCusProduct.filter((cusEnt) => {
		const ent: EntitlementWithFeature = cusEnt.entitlement;

		if (!entity) return true;

		if (
			notNullish(ent.entity_feature_id) &&
			entity?.feature_id != ent.entity_feature_id
		) {
			return false;
		}

		return true;
	});

	for (const cusEnt of cusEntsFiltered) {
		const cusProduct = cusEnt.customer_product;
		const feature = cusEnt.entitlement.feature;
		const ent: EntitlementWithFeature = cusEnt.entitlement;
		const key = `${ent.interval || "no-interval"}-${ent.interval_count || 1}-${feature.id}`;

		// 1. Handle boolean
		const isBoolean = feature.type == FeatureType.Boolean;

		const { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
			cusEnts: cusEntsWithCusProduct,
			internalFeatureId: feature.internal_id!,
		});

		// 1. Initialize balance object
		if (!data[key] && apiVersion == LegacyVersion.v1) {
			data[key] = getV1EntitlementsRes({
				org,
				cusEnt,
				isBoolean,
				unlimited,
				ent,
			});
		} else if (!data[key]) {
			if (isBoolean) {
				data[key] = {
					feature_id: feature.id,
				};
			} else if (unlimited) {
				data[key] = {
					feature_id: feature.id,
					unlimited: true,
				};
			} else {
				data[key] = {
					feature_id: feature.id,
					unlimited: isBoolean ? undefined : unlimited,
					interval:
						isBoolean || unlimited ? undefined : ent.interval || undefined,
					// interval_count:
					//   isBoolean || unlimited
					//     ? undefined
					//     : ent.interval_count || undefined,

					balance: isBoolean ? undefined : unlimited ? null : 0,
					total: isBoolean || unlimited ? undefined : 0,
					adjustment: isBoolean || unlimited ? undefined : 0,
					used: isBoolean ? undefined : unlimited ? null : 0,
					unused: 0,
					overage_allowed: usageAllowed,
				};

				if (org.config.api_version >= BREAK_API_VERSION) {
					data[key].next_reset_at =
						isBoolean || unlimited ? undefined : cusEnt.next_reset_at;
					data[key].allowance = isBoolean || unlimited ? undefined : 0;
					data[key].usage_limit = isBoolean || unlimited ? undefined : 0;
					data[key].interval_count = ent.interval_count || 1;
				}
			}
		}

		if (isBoolean || unlimited) {
			continue;
		}

		const { balance, adjustment, count, unused } = getCusEntBalance({
			cusEnt,
			entityId: entity?.id,
		});

		data[key].balance += balance || 0;
		data[key].adjustment += adjustment || 0;

		const total =
			(getResetBalance({
				entitlement: ent,
				options: getEntOptions(cusProduct.options, ent),
				relatedPrice: getRelatedCusPrice(cusEnt, cusPrices)?.price,
				productQuantity: cusProduct.quantity || 1,
			}) || 0) * count;

		data[key].total += total;
		data[key].unused += unused || 0;

		const rollover = getRolloverFields({
			cusEnt,
			entityId: entity?.id,
		});

		if (rollover) {
			data[key].balance += rollover.balance;
			data[key].total += rollover.balance + rollover.usage;
			data[key].rollovers = rollover.rollovers;
		}

		if (org.config.api_version >= BREAK_API_VERSION) {
			if (
				!data[key].next_reset_at ||
				(cusEnt.next_reset_at && cusEnt.next_reset_at < data[key].next_reset_at)
			) {
				data[key].next_reset_at = cusEnt.next_reset_at;
			}

			const resetBalance = getResetBalance({
				entitlement: ent,
				options: getEntOptions(cusProduct.options, ent),
				relatedPrice: getRelatedCusPrice(cusEnt, cusPrices)?.price,
				productQuantity: cusProduct.quantity || 1,
			});

			data[key].allowance += (resetBalance || 0) * count;

			const usageLimit = ent.usage_limit;

			if (notNullish(usageLimit)) {
				data[key].usage_limit += usageLimit;
			} else {
				data[key].usage_limit += resetBalance || 0;
			}
		}
	}

	const balances = Object.values(data);

	for (const balance of balances) {
		if (
			notNullOrUndefined(balance.total) &&
			notNullOrUndefined(balance.balance)
		) {
			balance.used =
				balance.total +
				balance.adjustment -
				balance.balance -
				(balance.unused || 0);

			delete balance.total;
			delete balance.adjustment;
		}
		delete balance.unused;
	}

	// Sort balances
	if (org.api_version == LegacyVersion.v1) {
		balances.sort((a: any, b: any) => {
			const featureA = features.find((f) => f.id == a.feature_id);
			const featureB = features.find((f) => f.id == b.feature_id);

			if (
				featureA?.type == FeatureType.Boolean &&
				featureB?.type != FeatureType.Boolean
			) {
				return -1;
			} else if (
				featureA?.type != FeatureType.Boolean &&
				featureB?.type == FeatureType.Boolean
			) {
				return 1;
			}

			if (a.unlimited && !b.unlimited) {
				return -1;
			} else if (!a.unlimited && b.unlimited) {
				return 1;
			}

			return a.feature_id.localeCompare(b.feature_id);
		});
	}

	// if (org.api_version == LegacyVersion.v1) {

	// }

	return balances as CusFeatureBalance[];
};
