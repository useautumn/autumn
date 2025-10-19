import {
	type AppEnv,
	BillingType,
	type Customer,
	type Entitlement,
	type Entity,
	EntityExpand,
	ErrCode,
	type Feature,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	type Organization,
	type UsagePriceConfig,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { submitUsageToStripe } from "@/external/stripe/stripeMeterUtils.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import {
	getBillingType,
	roundUsage,
} from "@/internal/products/prices/priceUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish } from "@/utils/genUtils.js";

export const getLinkedCusEnt = ({
	linkedFeature,
	cusEnts,
}: {
	linkedFeature: any;
	cusEnts: any;
}) => {
	// Get linked cus ent...
	const linkedCusEnt = cusEnts.find(
		(e: any) => e.entitlement.feature.id === linkedFeature.id,
	);

	if (!linkedCusEnt) {
		return null;
	}

	return linkedCusEnt;
};

export const entityFeatureIdExists = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	const ent = cusEnt.entitlement;
	return notNullish(ent.entity_feature_id);
};

export const entityMatchesFeature = ({
	feature,
	entity,
}: {
	feature: Feature;
	entity: Entity;
}) => {
	return feature.id == entity.feature_id;
};

export const entitlementLinkedToEntity = ({
	entitlement,
	entity,
}: {
	entitlement: Entitlement;
	entity: Entity;
}) => {
	return entitlement.entity_feature_id == entity.feature_id;
};

export const isLinkedToEntity = ({
	cusEnt,
	entity,
}: {
	cusEnt: FullCustomerEntitlement;
	entity: Entity;
}) => {
	return cusEnt.entitlement.entity_feature_id == entity.feature_id;
};

export const removeEntityFromCusEnt = async ({
	db,
	cusEnt,
	entity,
	logger,
	cusPrice,
	customer,
	org,
	env,
}: {
	db: DrizzleCli;
	cusEnt: FullCustomerEntitlement;
	entity: Entity;
	logger: any;
	cusPrice?: FullCustomerPrice;
	customer: Customer;
	org: Organization;
	env: AppEnv;
}) => {
	// isLinked
	const isLinked = isLinkedToEntity({
		cusEnt,
		entity,
	});

	if (!isLinked) {
		return;
	}

	const entitlement = cusEnt.entitlement;
	console.log(
		`Linked cus ent: ${entitlement.feature.id}, isLinked: ${isLinked}`,
	);

	// Delete cus ent ids
	const newEntities = structuredClone(cusEnt.entities!);

	// TODO: Send usage to stripe if cus price exists
	const stripeCli = createStripeCli({
		org,
		env,
	});
	if (cusPrice) {
		const config = cusPrice.price.config as UsagePriceConfig;
		const billingType = getBillingType(config);
		if (billingType == BillingType.UsageInArrear) {
			let usage = -newEntities[entity.id]?.balance;

			usage = roundUsage({
				usage,
				billingUnits: config.billing_units!,
			});

			await submitUsageToStripe({
				price: cusPrice.price,
				usage,
				customer,
				feature: entitlement.feature,
				logger,
				stripeCli,
			});
		}
	}

	delete newEntities[entity.id];

	await CusEntService.update({
		db,
		id: cusEnt.id,
		updates: {
			entities: newEntities,
		},
	});

	logger.info(
		`Feature: ${entitlement.feature.id}, customer: ${cusEnt.customer_id}, deleted entities from cus ent`,
	);
};

export const parseEntityExpand = (expand: string): EntityExpand[] => {
	if (expand) {
		const options = expand.split(",");
		const result: EntityExpand[] = [];
		for (const option of options) {
			if (!Object.values(EntityExpand).includes(option as EntityExpand)) {
				throw new RecaseError({
					message: `Invalid expand option: ${option}`,
					code: ErrCode.InvalidExpand,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
			result.push(option as EntityExpand);
		}
		return result;
	} else {
		return [];
	}
};
