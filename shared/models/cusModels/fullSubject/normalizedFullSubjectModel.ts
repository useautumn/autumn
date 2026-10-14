import { z } from "zod/v4";
import {
	type AggregatedFeatureBalance,
	AggregatedFeatureBalanceSchema,
} from "../../cusProductModels/cusEntModels/aggregatedCusEnt.js";
import type { CustomerEntitlementMetadata } from "../../cusProductModels/cusEntModels/cusEntModels.js";
import {
	type EntityBalance,
	FullCustomerEntitlementSchema,
	type UsageAttribution,
} from "../../cusProductModels/cusEntModels/cusEntModels.js";
import type { Replaceable } from "../../cusProductModels/cusEntModels/replaceableTable.js";
import type { DbRollover } from "../../cusProductModels/cusEntModels/rolloverModels/rolloverTable.js";
import type { UsageWindow } from "../../cusProductModels/cusEntModels/usageWindowTable.js";
import type { FullCustomerPrice } from "../../cusProductModels/cusPriceModels/cusPriceModels.js";
import { FullCustomerPriceSchema } from "../../cusProductModels/cusPriceModels/cusPriceModels.js";
import type { DbCustomerPrice } from "../../cusProductModels/cusPriceModels/cusPriceTable.js";
import {
	CusProductSchema,
	type FeatureOptions,
	FeatureOptionsSchema,
} from "../../cusProductModels/cusProductModels.js";
import type { DbCustomerProduct } from "../../cusProductModels/cusProductTable.js";
import type { DbCustomerLicense } from "../../licenseModels/customerLicenseTable.js";
import type { FullCustomerLicense } from "../../licenseModels/fullCustomerLicense.js";
import type { MigrationItemRunData } from "../../migrationV2Models/migrationItemRunSchema.js";
import type { DbPooledBalance } from "../../pooledBalanceModels/pooledBalanceTable.js";
import type { EntitlementWithFeature } from "../../productModels/entModels/entModels.js";
import type { DbFreeTrial } from "../../productModels/freeTrialModels/freeTrialTable.js";
import type { DbPrice } from "../../productModels/priceModels/priceTable.js";
import type { DbProduct } from "../../productModels/productTable.js";
import type { Subscription } from "../../subModels/subModels.js";
import type { Customer } from "../cusModels.js";
import type { Entity } from "../entityModels/entityModels.js";
import type { Invoice } from "../invoiceModels/invoiceModels.js";
import type { SubjectType } from "./fullSubjectModel.js";

export const SubjectFlagSchema = z.object({
	featureId: z.string(),
	internalFeatureId: z.string(),
	entitlementId: z.string(),
	customerEntitlementId: z.string(),
	customerProductId: z.string().nullable(),
	internalCustomerId: z.string(),
	internalEntityId: z.string().nullable(),
	expiresAt: z.number().nullable(),
	externalId: z.string().nullable(),
});

export type SubjectFlag = z.infer<typeof SubjectFlagSchema>;

export const SubjectBalanceSchema = FullCustomerEntitlementSchema.extend({
	customerPrice: FullCustomerPriceSchema.nullable(),
	customerProductOptions: FeatureOptionsSchema.nullable(),
	customerProductQuantity: z.number(),
	isEntityLevel: z.boolean(),
});

export type SubjectBalance = {
	id: string;
	customer_product_id: string | null;
	entitlement_id: string;
	internal_customer_id: string;
	internal_entity_id: string | null;
	internal_feature_id: string;
	feature_id: string;
	unlimited: boolean | null;
	balance: number;
	usage_attribution?: UsageAttribution;
	invoice_credit?: boolean;
	adjustment: number | null;
	additional_balance: number;
	usage_allowed: boolean | null;
	separate_interval: boolean;
	is_pooled_balance?: boolean;
	pooled_balance_id?: string | null;
	pooled_contribution_id?: string | null;
	pooled_balance?: DbPooledBalance;
	reset_cycle_anchor: number | null;
	next_reset_at: number | null;
	expires_at: number | null;
	external_id: string | null;
	metadata?: CustomerEntitlementMetadata | null;
	entities: Record<string, EntityBalance> | null;
	cache_version: number | null;
	created_at: number;
	customer_id?: string | null;

	entitlement: EntitlementWithFeature;
	replaceables: Replaceable[];
	rollovers: DbRollover[];
	customerPrice: FullCustomerPrice | null;
	customerProductOptions: FeatureOptions | null;
	customerProductQuantity: number;
	isEntityLevel: boolean;
};

export const AggregatedSubjectFlagSchema = z.object({
	feature_id: z.string(),
	internal_feature_id: z.string(),
	internal_customer_id: z.string(),
	api_id: z.string(),
});

export type AggregatedSubjectFlag = {
	feature_id: string;
	internal_feature_id: string;
	internal_customer_id: string;
	api_id: string;
};

export const EntityAggregationsSchema = z.object({
	aggregated_customer_products: z.array(CusProductSchema),
	aggregated_customer_entitlements: z.array(AggregatedFeatureBalanceSchema),
	aggregated_subject_flags: z
		.record(z.string(), AggregatedSubjectFlagSchema)
		.default({}),
});

export type EntityAggregations = {
	aggregated_customer_products: DbCustomerProduct[];
	aggregated_customer_entitlements: AggregatedFeatureBalance[];
	aggregated_subject_flags: Record<string, AggregatedSubjectFlag>;
};

export type NormalizedFullSubject = {
	subjectType: SubjectType;
	customerId: string;
	internalCustomerId: string;
	entityId?: string;
	internalEntityId?: string;

	customer: Customer;
	entity?: Entity;

	customer_products: (DbCustomerProduct & {
		parent_customer_license?: DbCustomerLicense | null;
		parent_customer_product?: Pick<
			DbCustomerProduct,
			"status" | "subscription_ids" | "canceled_at"
		> | null;
	})[];
	customer_entitlements: SubjectBalance[];
	customer_prices: DbCustomerPrice[];
	customer_licenses: FullCustomerLicense[];

	usage_windows: UsageWindow[];

	flags: Record<string, SubjectFlag>;

	products: DbProduct[];
	entitlements: EntitlementWithFeature[];
	prices: DbPrice[];
	free_trials: DbFreeTrial[];

	subscriptions: Subscription[];
	invoices: Invoice[];

	entity_aggregations?: EntityAggregations;

	migration_item_runs?: MigrationItemRunData[];
};
