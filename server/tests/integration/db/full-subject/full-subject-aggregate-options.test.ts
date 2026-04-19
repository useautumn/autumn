import { describe, expect, test } from "bun:test";
import { BillingType } from "@autumn/shared";
import { BillWhen } from "@shared/models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/index.js";
import {
	buildEntitySubjectScenario,
	type FullSubjectScenario,
} from "./utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "./utils/withInsertedScenario.js";

const buildAggregateOptionsScenario = ({
	name,
}: {
	name: string;
}): FullSubjectScenario => {
	const scenario = buildEntitySubjectScenario({
		ctx,
		name,
	});

	const messagesFeatureId = scenario.customerEntitlements[1]!.feature_id!;
	const messagesInternalFeatureId =
		scenario.customerEntitlements[1]!.internal_feature_id;

	const firstEntityCustomerProduct = {
		...scenario.customerProducts[1]!,
		options: [
			{
				feature_id: messagesFeatureId,
				internal_feature_id: messagesInternalFeatureId,
				quantity: 5,
			},
		],
	};
	const secondEntityCustomerProduct = {
		...scenario.customerProducts[2]!,
		internal_product_id: firstEntityCustomerProduct.internal_product_id,
		product_id: firstEntityCustomerProduct.product_id,
		created_at: (firstEntityCustomerProduct.created_at ?? 0) + 1,
		options: [
			{
				feature_id: messagesFeatureId,
				internal_feature_id: messagesInternalFeatureId,
				quantity: 5,
			},
		],
	};

	const firstEntityPrepaidEntitlement = {
		...scenario.entitlements[1]!,
		allowance: 100,
	};
	const secondEntityPrepaidEntitlement = {
		...scenario.entitlements[2]!,
		internal_product_id: firstEntityPrepaidEntitlement.internal_product_id,
		allowance: 100,
	};
	const firstEntityOverageEntitlement = {
		...firstEntityPrepaidEntitlement,
		id: `${firstEntityPrepaidEntitlement.id}_overage`,
		allowance: 200,
		created_at: firstEntityPrepaidEntitlement.created_at + 1,
	};
	const secondEntityOverageEntitlement = {
		...secondEntityPrepaidEntitlement,
		id: `${secondEntityPrepaidEntitlement.id}_overage`,
		allowance: 200,
		created_at: secondEntityPrepaidEntitlement.created_at + 1,
	};

	const firstEntityPrepaidPrice: (typeof scenario.prices)[number] = {
		...scenario.prices[1]!,
		entitlement_id: firstEntityPrepaidEntitlement.id,
		billing_type: BillingType.UsageInAdvance,
		config: {
			...scenario.prices[1]!.config,
			bill_when: BillWhen.StartOfPeriod,
			billing_units: 100,
			internal_feature_id: messagesInternalFeatureId,
			feature_id: messagesFeatureId,
		} as (typeof scenario.prices)[number]["config"],
	};
	const secondEntityPrepaidPrice: (typeof scenario.prices)[number] = {
		...scenario.prices[2]!,
		internal_product_id: firstEntityPrepaidEntitlement.internal_product_id!,
		entitlement_id: secondEntityPrepaidEntitlement.id,
		billing_type: BillingType.UsageInAdvance,
		config: {
			...scenario.prices[2]!.config,
			bill_when: BillWhen.StartOfPeriod,
			billing_units: 100,
			internal_feature_id: messagesInternalFeatureId,
			feature_id: messagesFeatureId,
		} as (typeof scenario.prices)[number]["config"],
	};
	const firstEntityOveragePrice: (typeof scenario.prices)[number] = {
		...firstEntityPrepaidPrice,
		id: `${firstEntityPrepaidPrice.id}_overage`,
		entitlement_id: firstEntityOverageEntitlement.id,
		billing_type: BillingType.UsageInArrear,
		config: {
			...firstEntityPrepaidPrice.config,
			bill_when: BillWhen.EndOfPeriod,
		} as (typeof scenario.prices)[number]["config"],
	};
	const secondEntityOveragePrice: (typeof scenario.prices)[number] = {
		...secondEntityPrepaidPrice,
		id: `${secondEntityPrepaidPrice.id}_overage`,
		entitlement_id: secondEntityOverageEntitlement.id,
		billing_type: BillingType.UsageInArrear,
		config: {
			...secondEntityPrepaidPrice.config,
			bill_when: BillWhen.EndOfPeriod,
		} as (typeof scenario.prices)[number]["config"],
	};

	const firstEntityPrepaidCustomerPrice = {
		...scenario.customerPrices[1]!,
		customer_product_id: firstEntityCustomerProduct.id,
		price_id: firstEntityPrepaidPrice.id,
	};
	const secondEntityPrepaidCustomerPrice = {
		...scenario.customerPrices[2]!,
		customer_product_id: secondEntityCustomerProduct.id,
		price_id: secondEntityPrepaidPrice.id,
	};
	const firstEntityOverageCustomerPrice = {
		...firstEntityPrepaidCustomerPrice,
		id: `${firstEntityPrepaidCustomerPrice.id}_overage`,
		price_id: firstEntityOveragePrice.id,
		created_at: firstEntityPrepaidCustomerPrice.created_at + 1,
	};
	const secondEntityOverageCustomerPrice = {
		...secondEntityPrepaidCustomerPrice,
		id: `${secondEntityPrepaidCustomerPrice.id}_overage`,
		price_id: secondEntityOveragePrice.id,
		created_at: secondEntityPrepaidCustomerPrice.created_at + 1,
	};

	const firstEntityPrepaidCustomerEntitlement = {
		...scenario.customerEntitlements[1]!,
		entitlement_id: firstEntityPrepaidEntitlement.id,
		customer_product_id: firstEntityCustomerProduct.id,
		internal_feature_id: messagesInternalFeatureId,
		feature_id: messagesFeatureId,
		balance: 600,
	};
	const secondEntityPrepaidCustomerEntitlement = {
		...scenario.customerEntitlements[2]!,
		entitlement_id: secondEntityPrepaidEntitlement.id,
		customer_product_id: secondEntityCustomerProduct.id,
		internal_feature_id: messagesInternalFeatureId,
		feature_id: messagesFeatureId,
		balance: 600,
	};
	const firstEntityOverageCustomerEntitlement = {
		...firstEntityPrepaidCustomerEntitlement,
		id: `${firstEntityPrepaidCustomerEntitlement.id}_overage`,
		external_id: `${firstEntityPrepaidCustomerEntitlement.external_id}_overage`,
		entitlement_id: firstEntityOverageEntitlement.id,
		balance: 200,
		created_at: firstEntityPrepaidCustomerEntitlement.created_at + 1,
	};
	const secondEntityOverageCustomerEntitlement = {
		...secondEntityPrepaidCustomerEntitlement,
		id: `${secondEntityPrepaidCustomerEntitlement.id}_overage`,
		external_id: `${secondEntityPrepaidCustomerEntitlement.external_id}_overage`,
		entitlement_id: secondEntityOverageEntitlement.id,
		balance: 200,
		created_at: secondEntityPrepaidCustomerEntitlement.created_at + 1,
	};

	return {
		...scenario,
		customerProducts: [
			scenario.customerProducts[0]!,
			firstEntityCustomerProduct,
			secondEntityCustomerProduct,
		],
		entitlements: [
			scenario.entitlements[0]!,
			firstEntityPrepaidEntitlement,
			secondEntityPrepaidEntitlement,
			firstEntityOverageEntitlement,
			secondEntityOverageEntitlement,
		],
		prices: [
			scenario.prices[0]!,
			firstEntityPrepaidPrice,
			secondEntityPrepaidPrice,
			firstEntityOveragePrice,
			secondEntityOveragePrice,
		],
		customerPrices: [
			scenario.customerPrices[0]!,
			firstEntityPrepaidCustomerPrice,
			secondEntityPrepaidCustomerPrice,
			firstEntityOverageCustomerPrice,
			secondEntityOverageCustomerPrice,
		],
		customerEntitlements: [
			scenario.customerEntitlements[0]!,
			firstEntityPrepaidCustomerEntitlement,
			secondEntityPrepaidCustomerEntitlement,
			firstEntityOverageCustomerEntitlement,
			secondEntityOverageCustomerEntitlement,
		],
	};
};

describe(`${chalk.yellowBright("fullSubject aggregate options")}`, () => {
	test("customer-scoped: aggregate options include both entity attachments for same product", async () => {
		const scenario = buildAggregateOptionsScenario({
			name: "fullsubject-aggregate-options-same-product-entities",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const fullSubject = await getFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
				});

				const aggregateMessagesBalance =
					fullSubject?.aggregated_customer_entitlements?.find(
						(aggregateFeatureBalance) =>
							aggregateFeatureBalance.feature_id ===
							scenario.customerEntitlements[1]!.feature_id,
					);

				expect(aggregateMessagesBalance).toBeDefined();
				expect(aggregateMessagesBalance?.allowance_total).toBe(600);
				expect(aggregateMessagesBalance?.prepaid_grant_from_options).toBe(1000);
				expect(aggregateMessagesBalance?.balance).toBe(1600);
				expect(aggregateMessagesBalance?.entity_count).toBe(2);
			},
		});
	});
});
