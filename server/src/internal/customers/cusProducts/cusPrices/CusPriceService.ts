import { DrizzleCli } from "@/db/initDrizzle.js";
import {
  CustomerPrice,
  FullCustomerEntitlement,
  FullCustomerPrice,
} from "@autumn/shared";
import { customerPrices } from "@autumn/shared";

import { eq } from "drizzle-orm";

export class CusPriceService {
  static async getRelatedToCusEnt({
    db,
    cusEnt,
  }: {
    db: DrizzleCli;
    cusEnt: FullCustomerEntitlement;
  }) {
    const customerPricesData = await db.query.customerPrices.findMany({
      where: eq(customerPrices.customer_product_id, cusEnt.customer_product_id),
      with: {
        price: true,
      },
    });

    const matchingCustomerPrice = customerPricesData.find(
      (cp) => cp.price?.entitlement_id === cusEnt.entitlement.id,
    ) as FullCustomerPrice | undefined;

    return matchingCustomerPrice || null;
  }

  static async insert({
    db,
    data,
  }: {
    db: DrizzleCli;
    data: CustomerPrice[] | CustomerPrice;
  }) {
    if (Array.isArray(data) && data.length == 0) {
      return;
    }

    await db.insert(customerPrices).values(data as any);
  }

  static async getByCustomerProductId({
    db,
    customerProductId,
  }: {
    db: DrizzleCli;
    customerProductId: string;
  }) {
    const data = await db.query.customerPrices.findMany({
      where: eq(customerPrices.customer_product_id, customerProductId),
      with: {
        price: true,
      },
    });

    return data as FullCustomerPrice[];
  }

  static async delete({ db, id }: { db: DrizzleCli; id: string }) {
    const deleted = await db
      .delete(customerPrices)
      .where(eq(customerPrices.id, id))
      .returning();
    return deleted;
  }
}
