import {
	CusProductStatus,
	cusEntToIncludedUsage,
	cusProductsToCusEnts,
	type Feature,
	FeatureType,
	getRelevantFeatures,
	type SetUsageParams,
	sumValues,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { CusService } from "../../customers/CusService.js";
import {
	getFeatureBalance,
	getUnlimitedAndUsageAllowed,
} from "../../customers/cusProducts/cusEnts/cusEntUtils.js";
import { featureToCreditSystem } from "../../features/creditSystemUtils.js";
import type { FeatureDeduction } from "../track/trackUtils/getFeatureDeductions.js";

// 2. Get deductions for each feature
export const getSetUsageDeductions = async ({
	ctx,
	setUsageParams,
}: {
	ctx: AutumnContext;
	setUsageParams: SetUsageParams;
}): Promise<FeatureDeduction[]> => {
	const { db, org, env, features: allFeatures } = ctx;
	const { value, entity_id } = setUsageParams;

	const features = getRelevantFeatures({
		features: allFeatures,
		featureId: setUsageParams.feature_id,
	});

	const fullCus = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: setUsageParams.customer_id,
		orgId: ctx.org.id,
		env: ctx.env,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		entityId: setUsageParams.entity_id,
	});

	const cusEnts = cusProductsToCusEnts({
		cusProducts: fullCus.customer_products,
		reverseOrder: org.config?.reverse_deduction_order,
	});

	const meteredFeature =
		features.find((f: Feature) => f.type === FeatureType.Metered) ||
		features[0];

	const featureDeductions = [];
	for (const feature of features) {
		let newValue = value;

		const { unlimited } = getUnlimitedAndUsageAllowed({
			cusEnts,
			internalFeatureId: feature.internal_id!,
		});

		if (unlimited) continue;

		if (feature.type === FeatureType.CreditSystem) {
			newValue = featureToCreditSystem({
				featureId: meteredFeature.id,
				creditSystem: feature,
				amount: value,
			});
		}

		// If it's set
		let deduction = newValue;

		const totalAllowance = sumValues(
			cusEnts.map((cusEnt) =>
				cusEntToIncludedUsage({ cusEnt, entityId: setUsageParams.entity_id }),
			),
		);

		const targetBalance = new Decimal(totalAllowance).sub(value).toNumber();

		const totalBalance = getFeatureBalance({
			cusEnts,
			internalFeatureId: feature.internal_id!,
			entityId: entity_id,
		})!;

		deduction = new Decimal(totalBalance).sub(targetBalance).toNumber();

		if (deduction === 0) {
			console.log(`   - Skipping feature ${feature.id} -- deduction is 0`);
			continue;
		}

		featureDeductions.push({
			feature,
			deduction,
		});
	}

	featureDeductions.sort((a, b) => {
		if (
			a.feature.type === FeatureType.CreditSystem &&
			b.feature.type !== FeatureType.CreditSystem
		) {
			return 1;
		}

		if (
			a.feature.type !== FeatureType.CreditSystem &&
			b.feature.type === FeatureType.CreditSystem
		) {
			return -1;
		}

		return a.feature.id.localeCompare(b.feature.id);
	});

	return featureDeductions;
};
