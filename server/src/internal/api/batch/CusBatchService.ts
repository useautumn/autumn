import { DrizzleCli } from "@/db/initDrizzle.js";
import {
  AppEnv,
  Organization,
  CusProductStatus,
  FullCustomer,
  Feature,
  CusExpand,
} from "@autumn/shared";

import type { NodeClickHouseClient } from "@clickhouse/client/dist/client.js";
import { getPaginatedFullCusQuery } from "../../customers/getFullCusQuery.js";
import { getCustomerDetails } from "../../customers/cusUtils/getCustomerDetails.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";

export class CusBatchService {
  static async getByInternalIds({
    db,
    org,
    env,
    internalCustomerIds,
  }: {
    db: DrizzleCli;
    org: Organization;
    env: AppEnv;
    internalCustomerIds: string[];
  }) {
    let query = getPaginatedFullCusQuery({
      orgId: org.id,
      env,
      includeInvoices: true,
      withEntities: true,
      withTrialsUsed: false,
      withSubs: true,
      limit: 100,
      offset: 0,
      internalCustomerIds,
    });
    let results = await db.execute(query);

    return results as unknown as FullCustomer[];
  }

  static async getPage({
    db,
    ch,
    org,
    env,
    limit,
    offset,
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
    limit: number;
    offset: number;
    features: Feature[];
    statuses: CusProductStatus[];
    expand?: CusExpand[];
    logger?: any;
    reqApiVersion?: number;
  }) {
    if (!limit) limit = 10;
    if (!offset) offset = 0;

    if (!statuses) statuses = RELEVANT_STATUSES;

    const includeInvoices = expand.includes(CusExpand.Invoices);
    const withEntities = expand.includes(CusExpand.Entities);
    const withTrialsUsed = expand.includes(CusExpand.TrialsUsed);

    let query = getPaginatedFullCusQuery({
      orgId: org.id,
      env,
      inStatuses: statuses,
      includeInvoices,
      withEntities,
      withTrialsUsed,
      withSubs: true,
      limit,
      offset,
    });
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

    return finals;
  }

  /**
   * Normalize customer data by converting string fields to numbers
   */
  private static normalizeCustomerData(rawCustomer: any): any {
    const normalizeTimestamp = (value: any): number => {
      if (typeof value === "string") {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? Date.now() : parsed;
      }
      return typeof value === "number" ? value : Date.now();
    };

    const normalizedCustomer = {
      ...rawCustomer,
      created_at: normalizeTimestamp(rawCustomer.created_at),
    };

    // Normalize customer products
    if (
      rawCustomer.customer_products &&
      Array.isArray(rawCustomer.customer_products)
    ) {
      normalizedCustomer.customer_products = rawCustomer.customer_products.map(
        (cp: any) => ({
          ...cp,
          created_at: normalizeTimestamp(cp.created_at),
          starts_at: cp.starts_at
            ? normalizeTimestamp(cp.starts_at)
            : normalizeTimestamp(cp.created_at),
          canceled_at: cp.canceled_at
            ? normalizeTimestamp(cp.canceled_at)
            : null,
          ended_at: cp.ended_at ? normalizeTimestamp(cp.ended_at) : null,
          trial_ends_at: cp.trial_ends_at
            ? normalizeTimestamp(cp.trial_ends_at)
            : null,
          quantity: cp.quantity ? parseInt(cp.quantity, 10) || 1 : 1,
          options: cp.options || [],
          collection_method: cp.collection_method || "charge_automatically",
          subscription_ids: cp.subscription_ids || [],
          scheduled_ids: cp.scheduled_ids || [],
          // Normalize customer entitlements
          customer_entitlements: (cp.customer_entitlements || []).map(
            (ce: any) => ({
              ...ce,
              created_at: normalizeTimestamp(ce.created_at),
              next_reset_at: ce.next_reset_at
                ? normalizeTimestamp(ce.next_reset_at)
                : null,
              balance: ce.balance ? parseFloat(ce.balance) || 0 : 0,
              adjustment: ce.adjustment ? parseFloat(ce.adjustment) || 0 : 0,
            })
          ),
        })
      );
    }

    return normalizedCustomer;
  }
}
