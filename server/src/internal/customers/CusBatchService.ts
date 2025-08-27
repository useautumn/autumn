import { DrizzleCli } from "@/db/initDrizzle.js";
import {
	AppEnv,
	Organization,
	CusProductStatus,
	FullCustomer,
	Feature,
	CusExpand,
	FullCusProduct,
	APIVersion,
	CusResponseSchema,
	CustomerResponseSchema,
	FeatureType,
	CusEntResponseSchema,
} from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { sql } from "drizzle-orm";
import { ClickHouseManager } from "@/external/clickhouse/ClickHouseManager.js";
import type { NodeClickHouseClient } from "@clickhouse/client/dist/client.js";
import {
    getPaginatedFullCusQuery,
} from "./getFullCusQuery.js";
import { getCustomerDetails } from "./cusUtils/getCustomerDetails.js";
import { orgToVersion } from "@/utils/versionUtils.js";
import {
  cusProductsToCusEnts,
  cusProductsToCusPrices,
} from "./cusProducts/cusProductUtils/convertCusProduct.js";
import { processFullCusProducts } from "./cusUtils/cusProductResponseUtils/processFullCusProducts.js";
import { getCusBalances } from "./cusUtils/cusFeatureResponseUtils/getCusBalances.js";
import { featuresToObject } from "./cusUtils/cusFeatureResponseUtils/balancesToFeatureResponse.js";
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
		expand = [],
		logger = console,
		reqApiVersion,
	}: {
		db: DrizzleCli;
		ch: NodeClickHouseClient;
		org: Organization;
		env: AppEnv;
		page: number;
		pageSize: number;
		features: Feature[];
		statuses: CusProductStatus[];
		expand?: CusExpand[];
		logger?: any;
		reqApiVersion?: number;
	}) {
		if (!page) page = 1;
		if (!pageSize) pageSize = 10;
		const offset = (page - 1) * pageSize;

		if (!statuses) statuses = [CusProductStatus.Active];

        const includeInvoices = expand.includes(CusExpand.Invoices);
        const withEntities = expand.includes(CusExpand.Entities);
        const withTrialsUsed = expand.includes(CusExpand.TrialsUsed);
        let query = getPaginatedFullCusQuery(
            org.id,
            env,
            statuses,
            includeInvoices,
            withEntities,
            withTrialsUsed,
            true,
            page,
            pageSize,
        );
        let results = await db.execute(query);
        let finals = [];
        for (let result of results) {
            try {
                const normalizedCustomer = this.normalizeCustomerData(result);
                const customer = normalizedCustomer as FullCustomer;
                const cusProducts = customer.customer_products || [];

                const customerDetails = await getCustomerDetails({
                    db,
                    customer,
                    features,
                    org,
                    env,
                    params: {},
                    logger: console,
                    cusProducts,
                    expand: expand,
                    reqApiVersion: reqApiVersion,
                });
                
                finals.push(customerDetails);
            } catch (error) {
                console.error(`Failed to process customer ${result.id}:`, error);
            }
        }

        return finals
	}

	/**
	 * Normalize customer data by converting string fields to numbers
	 */
	private static normalizeCustomerData(rawCustomer: any): any {
		const normalizeTimestamp = (value: any): number => {
			if (typeof value === 'string') {
				const parsed = parseInt(value, 10);
				return isNaN(parsed) ? Date.now() : parsed;
			}
			return typeof value === 'number' ? value : Date.now();
		};

		const normalizedCustomer = {
			...rawCustomer,
			created_at: normalizeTimestamp(rawCustomer.created_at),
		};

		// Normalize customer products
		if (rawCustomer.customer_products && Array.isArray(rawCustomer.customer_products)) {
			normalizedCustomer.customer_products = rawCustomer.customer_products.map((cp: any) => ({
				...cp,
				created_at: normalizeTimestamp(cp.created_at),
				starts_at: cp.starts_at ? normalizeTimestamp(cp.starts_at) : normalizeTimestamp(cp.created_at),
				canceled_at: cp.canceled_at ? normalizeTimestamp(cp.canceled_at) : null,
				ended_at: cp.ended_at ? normalizeTimestamp(cp.ended_at) : null,
				trial_ends_at: cp.trial_ends_at ? normalizeTimestamp(cp.trial_ends_at) : null,
				quantity: cp.quantity ? parseInt(cp.quantity, 10) || 1 : 1,
				options: cp.options || [],
				collection_method: cp.collection_method || 'charge_automatically',
				subscription_ids: cp.subscription_ids || [],
				scheduled_ids: cp.scheduled_ids || [],
				// Normalize customer entitlements
				customer_entitlements: (cp.customer_entitlements || []).map((ce: any) => ({
					...ce,
					created_at: normalizeTimestamp(ce.created_at),
					next_reset_at: ce.next_reset_at ? normalizeTimestamp(ce.next_reset_at) : null,
					balance: ce.balance ? parseFloat(ce.balance) || 0 : 0,
					adjustment: ce.adjustment ? parseFloat(ce.adjustment) || 0 : 0,
				})),
			}));
		}

		return normalizedCustomer;
	}

	/**
	 * Process customer for batch operations without additional DB calls
	 * This is a simplified version that extracts key parts from getCustomerDetails
	 */
	private static async processCustomerForBatch({
		customer,
		cusProducts,
		features,
		org,
		reqApiVersion,
	}: {
		customer: FullCustomer;
		cusProducts: FullCusProduct[];
		features: Feature[];
		org: Organization;
		reqApiVersion?: number;
	}) {
		const apiVersion = orgToVersion({
			org,
			reqApiVersion,
		});

		const inStatuses = org.config.include_past_due
			? [CusProductStatus.Active, CusProductStatus.PastDue]
			: [CusProductStatus.Active];

		const cusEnts = cusProductsToCusEnts({ cusProducts, inStatuses }) as any;

		const balances = await getCusBalances({
			cusEntsWithCusProduct: cusEnts,
			cusPrices: cusProductsToCusPrices({ cusProducts, inStatuses }),
			org,
			apiVersion,
		});

		const subs = customer.subscriptions || [];
		const { main, addOns } = await processFullCusProducts({
			fullCusProducts: cusProducts,
			subs,
			org,
			apiVersion,
			entities: customer.entities,
			features,
		});

		if (apiVersion >= APIVersion.v1_1) {
			const products: any = [...main, ...addOns];

			let entList: any = balances.map((b) => {
				let isBoolean =
					features.find((f: Feature) => f.id == b.feature_id)?.type ==
					FeatureType.Boolean;
				if (b.unlimited || isBoolean) {
					return b;
				}

				return CusEntResponseSchema.parse({
					...b,
					usage: b.used,
					included_usage: b.allowance,
				});
			});

			if (apiVersion >= APIVersion.v1_2) {
				entList = featuresToObject({
					features,
					entList,
				});
			}

			const cusResponse = {
				...CusResponseSchema.parse({
					...customer,
					stripe_id: customer.processor?.id,
					features: entList,
					products,
					invoices: undefined,
					trials_used: undefined,
					rewards: undefined,
					metadata: customer.metadata,
					entities: undefined,
					referrals: undefined,
					payment_method: undefined,
				}),
			};

			return cusResponse;
		} else {
			// Legacy API version handling
			return {
				customer: CustomerResponseSchema.parse(customer),
				products: main,
				add_ons: addOns,
				entitlements: [],
				invoices: [],
				trials_used: undefined,
			};
		}
	}
}