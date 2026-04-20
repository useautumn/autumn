import { z } from "zod/v4";
import {
	type AggregatedFeatureBalance,
	AggregatedFeatureBalanceSchema,
} from "../../cusProductModels/cusEntModels/aggregatedCusEnt.js";
import {
	type EntityBalance,
	FullCustomerEntitlementSchema,
} from "../../cusProductModels/cusEntModels/cusEntModels.js";
import type { Replaceable } from "../../cusProductModels/cusEntModels/replaceableTable.js";
import type { DbRollover } from "../../cusProductModels/cusEntModels/rolloverModels/rolloverTable.js";
import type { FullCustomerPrice } from "../../cusProductModels/cusPriceModels/cusPriceModels.js";
import { FullCustomerPriceSchema } from "../../cusProductModels/cusPriceModels/cusPriceModels.js";
import type { DbCustomerPrice } from "../../cusProductModels/cusPriceModels/cusPriceTable.js";
import {
	CusProductSchema,
	type FeatureOptions,
	FeatureOptionsSchema,
} from "../../cusProductModels/cusProductModels.js";
import type { DbCustomerProduct } from "../../cusProductModels/cusProductTable.js";
import type { EntitlementWithFeature } from "../../productModels/entModels/entModels.js";
import type { DbFreeTrial } from "../../productModels/freeTrialModels/freeTrialTable.js";
import type { DbPrice } from "../../productModels/priceModels/priceTable.js";
import type { DbProduct } from "../../productModels/productTable.js";
import type { Subscription } from "../../subModels/subModels.js";
import type { Customer } from "../cusModels.js";
import type { Entity } from "../entityModels/entityModels.js";
import type { Invoice } from "../invoiceModels/invoiceModels.js";
import type { SubjectType } from "./fullSubjectModel.js";

/**
 * Schema mirror of the `SubjectFlag` shape. Used by the cached-payload
 * schema walker to know where nullable positions are.
 */
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

export type SubjectFlag = {
	featureId: string;
	internalFeatureId: string;
	entitlementId: string;
	customerEntitlementId: string;
	customerProductId: string | null;
	internalCustomerId: string;
	internalEntityId: string | null;
	expiresAt: number | null;
	externalId: string | null;
};

/**
 * Schema mirror of `SubjectBalance`. Extends `FullCustomerEntitlementSchema`
 * with the helper fields attached during normalization (customerPrice,
 * customerProductOptions, customerProductQuantity, isEntityLevel).
 *
 * Used by the cache-hole-filling walker; this is not a validator — the
 * runtime `SubjectBalance` type below is the source of truth.
 */
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
	adjustment: number | null;
	additional_balance: number;
	usage_allowed: boolean | null;
	next_reset_at: number | null;
	expires_at: number | null;
	external_id: string | null;
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

/**
 * Schema mirror of `EntityAggregations`. Reuses `CusProductSchema` as the Zod
 * mirror of `DbCustomerProduct` for the aggregated customer products array.
 */
export const EntityAggregationsSchema = z.object({
	aggregated_customer_products: z.array(CusProductSchema),
	aggregated_customer_entitlements: z.array(AggregatedFeatureBalanceSchema),
});

export type EntityAggregations = {
	aggregated_customer_products: DbCustomerProduct[];
	aggregated_customer_entitlements: AggregatedFeatureBalance[];
};

/**
 * Normalized (flat-array) representation of a customer or entity subject.
 *
 * - `customer_entitlements` contains metered balances only (product + extra
 *   combined, distinguished by `customer_product_id` being null for extras).
 * - Boolean CEs are collapsed into `flags`.
 * - Each `SubjectBalance` carries the pre-resolved context needed by the
 *   deduction path, so each Redis hash field can be self-contained.
 * - Catalog arrays (`products`, `entitlements`, `prices`, `free_trials`) are
 *   deduplicated reference data shared across the subject.
 *
 * This is the shape stored in Redis (split across a subject STRING + per-feature
 * balance HASHes) and the shape the DB query naturally returns.
 */
export type NormalizedFullSubject = {
	subjectType: SubjectType;
	customerId: string;
	internalCustomerId: string;
	entityId?: string;
	internalEntityId?: string;

	customer: Customer;
	entity?: Entity;

	customer_products: DbCustomerProduct[];
	customer_entitlements: SubjectBalance[];
	customer_prices: DbCustomerPrice[];

	flags: Record<string, SubjectFlag>;

	products: DbProduct[];
	entitlements: EntitlementWithFeature[];
	prices: DbPrice[];
	free_trials: DbFreeTrial[];

	subscriptions: Subscription[];
	invoices: Invoice[];

	entity_aggregations?: EntityAggregations;
};
