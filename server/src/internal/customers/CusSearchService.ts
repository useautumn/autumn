import { DrizzleCli } from "@/db/initDrizzle.js";

import { AppEnv, customers, CusProductStatus } from "@autumn/shared";

import { and, desc, eq, ilike, or, lt, isNotNull, gt, sql } from "drizzle-orm";
import { customerProducts, products } from "@autumn/shared";

const customerFields = {
  internal_id: customers.internal_id,
  id: customers.id,
  name: customers.name,
  email: customers.email,
  created_at: customers.created_at,
};

const customerProductFields = {
  id: customerProducts.id,
  internal_product_id: customerProducts.internal_product_id,
  product_id: customerProducts.product_id,
  canceled_at: customerProducts.canceled_at,
  status: customerProducts.status,
  trial_ends_at: customerProducts.trial_ends_at,
};

const productFields = {
  internal_id: products.internal_id,
  id: products.id,
  name: products.name,
  version: products.version,
};

export class CusSearchService {
  static async searchByProduct({
    db,
    orgId,
    env,
    search,
    filters,
    pageSize = 50,
    lastItem,
  }: {
    db: DrizzleCli;
    orgId: string;
    env: AppEnv;
    search: string;
    filters: any;
    pageSize?: number;
    lastItem?: { created_at: string; name: string; internal_id: string } | null;
  }) {
    // 1. Create base query to fetch all customerproducts
    let activeProdFilter = or(
      eq(customerProducts.status, CusProductStatus.Active),
      eq(customerProducts.status, CusProductStatus.PastDue),
    );

    let filtersDrizzle = and(
      filters.product_id
        ? eq(customerProducts.product_id, filters.product_id)
        : undefined,
      filters.status === "canceled"
        ? and(activeProdFilter, isNotNull(customerProducts.canceled_at))
        : undefined,
      filters.status === "free_trial"
        ? and(
            gt(customerProducts.trial_ends_at, Date.now()),
            isNotNull(customerProducts.free_trial_id),
          )
        : undefined,
    );

    let cusFilter = and(
      eq(customers.org_id, orgId),
      eq(customers.env, env),

      search
        ? or(
            ilike(customers.id, `%${search}%`),
            ilike(customers.name, `%${search}%`),
            ilike(customers.email, `%${search}%`),
          )
        : undefined,
    );

    const [results, totalCountResult] = await Promise.all([
      db
        .select({
          customer: customerFields,
          customerProduct: customerProductFields,
          product: productFields,
        })
        .from(customerProducts)
        .leftJoin(
          customers,
          eq(customerProducts.internal_customer_id, customers.internal_id),
        )
        .leftJoin(
          products,
          eq(customerProducts.internal_product_id, products.internal_id),
        )
        .where(
          and(
            activeProdFilter,
            filtersDrizzle,
            cusFilter,
            lastItem && lastItem.internal_id
              ? lt(customers.internal_id, lastItem.internal_id)
              : undefined,
          ),
        )
        .orderBy(desc(customers.internal_id))
        .limit(pageSize),

      db
        .select({
          totalCount: sql<number>`count(distinct ${customers.internal_id})`.as(
            "total_count",
          ),
        })
        .from(customerProducts)
        .leftJoin(
          customers,
          eq(customerProducts.internal_customer_id, customers.internal_id),
        )
        .leftJoin(
          products,
          eq(customerProducts.internal_product_id, products.internal_id),
        )
        .where(and(activeProdFilter, filtersDrizzle, cusFilter)),
    ]);

    // Process the results to group customer products by customer
    const customerMap = new Map();

    for (const row of results) {
      const customerId = row.customer?.internal_id;
      if (!customerId) continue;

      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          ...row.customer,
          customer_products: [],
        });
      }

      if (row.customerProduct && row.product) {
        customerMap.get(customerId).customer_products.push({
          ...row.customerProduct,
          product: row.product,
        });
      }
    }

    const processedData = Array.from(customerMap.values());

    const totalCount = totalCountResult[0]?.totalCount || 0;

    return { data: processedData, count: totalCount };
  }

  static async search({
    db,
    orgId,
    env,
    search,
    pageSize = 50,
    filters,
    lastItem,
    pageNumber,
  }: {
    db: DrizzleCli;
    orgId: string;
    env: AppEnv;
    search: string;
    lastItem?: { created_at: string; name: string; internal_id: string } | null;
    filters: any;
    pageSize?: number;
    pageNumber: number;
  }) {
    if (filters.product_id || filters.status) {
      return await this.searchByProduct({
        db,
        orgId,
        env,
        search,
        filters,
        pageSize,
        lastItem,
      });
    }

    let filterClause = and(
      eq(customers.org_id, orgId),
      eq(customers.env, env),
      search
        ? or(
            ilike(customers.id, `%${search}%`),
            ilike(customers.name, `%${search}%`),
            ilike(customers.email, `%${search}%`),
          )
        : undefined,
    );

    // Create the base customer query as a subquery
    const baseQuery = db
      .select(customerFields)
      .from(customers)
      .where(
        and(
          filterClause,
          lastItem && lastItem.internal_id
            ? lt(customers.internal_id, lastItem.internal_id)
            : undefined,
        ),
      )
      .orderBy(desc(customers.internal_id))
      .limit(pageSize)
      .as("baseQuery");

    // Get total count in parallel without pagination
    const totalCountQuery = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(customers)
      .where(filterClause);

    // Now join with customer products and products
    const [results, totalCountResult] = await Promise.all([
      db
        .select({
          // Customer fields
          customer: {
            internal_id: baseQuery.internal_id,
            id: baseQuery.id,
            name: baseQuery.name,
            email: baseQuery.email,
            created_at: baseQuery.created_at,
          },
          // Customer product fields
          customerProduct: customerProductFields,
          // Product fields
          product: productFields,
        })
        .from(baseQuery)
        .leftJoin(
          customerProducts,
          eq(baseQuery.internal_id, customerProducts.internal_customer_id),
        )
        .leftJoin(
          products,
          eq(customerProducts.internal_product_id, products.internal_id),
        )
        .orderBy(desc(baseQuery.internal_id)),
      totalCountQuery,
    ]);

    if (results.length === 0) {
      return { data: [], count: 0 };
    }

    const totalCount = totalCountResult[0]?.count || 0;

    // Group the results by customer
    const customerMap = new Map();

    for (const row of results) {
      const customerId = row.customer.internal_id;

      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          ...row.customer,
          created_at: Number(row.customer.created_at),
          customer_products: [],
        });
      }

      // Add customer product if it exists
      if (row.customerProduct && row.customerProduct.id) {
        customerMap.get(customerId).customer_products.push({
          ...row.customerProduct,
          product: row.product,
        });
      }
    }

    const finalResults = Array.from(customerMap.values());

    return { data: finalResults, count: totalCount };
  }
}
