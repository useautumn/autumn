import { DrizzleCli } from "@/db/initDrizzle.js";
import { Autumn } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { AppEnv, CusProductStatus, FullCusProduct } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export const getMainCusProduct = async ({
  db,
  customerId,
  orgId,
  env,
}: {
  db: DrizzleCli;
  customerId: string;
  orgId: string;
  env: AppEnv;
}) => {
  let customer = await CusService.getFull({
    db,
    idOrInternalId: customerId,
    orgId,
    env,
    withEntities: true,
    inStatuses: [CusProductStatus.Active],
  });

  let cusProducts = customer.customer_products;

  let mainCusProduct = cusProducts.find(
    (cusProduct: FullCusProduct) => !cusProduct.product.is_add_on,
  );

  return mainCusProduct || null;
};
