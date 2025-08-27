import { DrizzleCli } from "@/db/initDrizzle.js";
import { AppEnv, Organization, CusProductStatus, FullCustomer, Feature, CusExpand } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { sql } from "drizzle-orm";
import { ClickHouseManager } from "@/external/clickhouse/ClickHouseManager.js";
import type { NodeClickHouseClient } from "@clickhouse/client/dist/client.js";
import { getBulkFullCusQuery, getBulkFullCusQueryClickHouse } from "./getFullCusQuery.js";
import { getCustomerDetails } from "./cusUtils/getCustomerDetails.js";
export class CusBatchService {
	static async getPage({
		db,
        ch,
		org,
		env,
		page,
		pageSize,
        features,
        statuses,
	}: {
		db: DrizzleCli;
        ch: NodeClickHouseClient;
		org: Organization;
		env: AppEnv;
		page: number;
		pageSize: 10 | 50 | 100 | 500;
        features: Feature[];
        statuses: CusProductStatus[];
	}) {
        if(!page) page = 1;
        if(!pageSize) pageSize = 10;
		const offset = (page - 1) * pageSize;
        
        if(!statuses) statuses = [CusProductStatus.Active];
        const { query, query_params } = getBulkFullCusQueryClickHouse(org.id, env, page, pageSize, statuses, false);
        
        const result = await ch.query({ query, query_params });
        const resultJson = await result.json();
        console.log(resultJson);
        if(!('data' in resultJson)) return resultJson;
        
        // Convert raw ClickHouse data to FullCustomer format and process with getCustomerDetails
        const customers = await Promise.all(
            resultJson.data.map(async (rawCustomer: any) => {
                // Convert to FullCustomer format
                const fullCustomer: FullCustomer = {
                    id: rawCustomer['c.id'],
                    internal_id: rawCustomer['c.internal_id'],
                    org_id: rawCustomer['c.org_id'],
                    env: rawCustomer['c.env'] as AppEnv,
                    fingerprint: rawCustomer.fingerprint || null,
                    created_at: rawCustomer['c.created_at'],
                    name: rawCustomer['c.name'] || null,
                    email: rawCustomer.email || null,
                    metadata: rawCustomer.metadata ? JSON.parse(rawCustomer.metadata) : {},
                    processor: rawCustomer['c.processor'] ? JSON.parse(rawCustomer['c.processor']) : null,
                    customer_products: this.parseCustomerProducts(rawCustomer.customer_products),
                    entities: [],
                    subscriptions: [],
                    invoices: [],
                    trials_used: [],
                };

                // Use the same processing pipeline as single customer API
                return await getCustomerDetails({
                    db,
                    customer: fullCustomer,
                    features: [], // TODO: Get features from context
                    org,
                    env,
                    logger: console, // TODO: Get logger from context
                    cusProducts: fullCustomer.customer_products,
                    expand: [], // Basic expand for batch
                });
            })
        );
        
        return customers;
    }

    private static parseCustomerProducts(rawProducts: any[]): any[] {
        if (!Array.isArray(rawProducts)) return [];
        
        return rawProducts.map(productTuple => {
            if (!Array.isArray(productTuple) || productTuple.length < 26) return null;
            
            const [
                id, internal_customer_id, internal_product_id, internal_entity_id,
                created_at, status, processor, canceled_at, ended_at, starts_at,
                options, product_id, free_trial_id, trial_ends_at, collection_method,
                subscription_ids, scheduled_ids, quantity, is_custom, customer_id,
                entity_id, api_version, productData, customerPrices, customerEntitlements, freeTrial
            ] = productTuple;

            return {
                id,
                internal_customer_id,
                internal_product_id,
                internal_entity_id,
                created_at,
                status,
                processor: processor ? JSON.parse(processor) : null,
                canceled_at,
                ended_at,
                starts_at,
                options: options ? JSON.parse(options) : [],
                product_id,
                free_trial_id,
                trial_ends_at,
                collection_method,
                subscription_ids: subscription_ids || [],
                scheduled_ids: scheduled_ids || [],
                quantity,
                is_custom,
                customer_id,
                entity_id,
                api_version,
                product: this.parseProduct(productData),
                customer_prices: [],  // TODO: Parse from ClickHouse data
                customer_entitlements: [], // TODO: Parse from ClickHouse data
                free_trial: this.parseFreeTrial(freeTrial),
            };
        }).filter(Boolean);
    }

    private static parseProduct(productData: any): any {
        if (!Array.isArray(productData) || productData.length < 13) return null;
        
        const [
            internal_id, id, name, org_id, created_at, env,
            is_add_on, is_default, group, version, processor,
            base_variant_id, archived
        ] = productData;

        return {
            internal_id, id, name, org_id, created_at, env,
            is_add_on, is_default, group, version,
            processor: processor ? JSON.parse(processor) : null,
            base_variant_id, archived
        };
    }

    private static parseFreeTrial(freeTrialData: any): any {
        if (!Array.isArray(freeTrialData) || freeTrialData.length < 8) return null;
        
        const [
            id, created_at, internal_product_id, duration,
            length, unique_fingerprint, is_custom, card_required
        ] = freeTrialData;

        return {
            id, created_at, internal_product_id, duration,
            length, unique_fingerprint, is_custom, card_required
        };
    }
}
