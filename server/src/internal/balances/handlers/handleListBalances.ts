import {
    customerEntitlements,
    customerProducts,
    entitlements,
    features,
} from "@autumn/shared";
import { CustomerNotFoundError } from "@shared/index";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";

const ListBalancesSchema = z.object({
    customer_id: z.string(),
});

export const handleListBalances = createRoute({
    query: ListBalancesSchema,
    handler: async (c) => {
        const ctx = c.get("ctx");
        const { customer_id } = c.req.valid("query");

        const fullCus = await CusService.getFull({
            db: ctx.db,
            idOrInternalId: customer_id,
            orgId: ctx.org.id,
            env: ctx.env,
        });

        if (!fullCus) {
            throw new CustomerNotFoundError({ customerId: customer_id });
        }

        // Get customer entitlements where the entitlement has no internal_product_id
        const rawBalances = await ctx.db
            .select({
                customer_entitlement: customerEntitlements,
                entitlement: entitlements,
                feature: features,
                customer_product: customerProducts,
            })
            .from(customerEntitlements)
            .innerJoin(
                entitlements,
                eq(customerEntitlements.entitlement_id, entitlements.id),
            )
            .innerJoin(
                features,
                eq(entitlements.internal_feature_id, features.internal_id),
            )
            .leftJoin(
                customerProducts,
                eq(customerEntitlements.customer_product_id, customerProducts.id),
            )
            .where(
                and(
                    eq(customerEntitlements.internal_customer_id, fullCus.internal_id),
                    isNull(entitlements.internal_product_id),
                ),
            );

        const formattedBalances = rawBalances.map((row) => ({
            ...row.customer_entitlement,
            entitlement: {
                ...row.entitlement,
                feature: row.feature,
            },
            customer_product: row.customer_product
                ? {
                    ...row.customer_product,
                    product: null,
                    customer_entitlements: [],
                    customer_prices: [],
                    free_trial: null,
                }
                : null,
        }));

        return c.json({ balances: formattedBalances });
    },
});
