import { Autumn } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { AppEnv, CusProductStatus, FullCusProduct } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

export const getMainCusProduct = async ({
  sb,
  customerId,
  orgId,
  env,
}: {
  sb: SupabaseClient;
  customerId: string;
  orgId: string;
  env: AppEnv;
}) => {
  let customer = await CusService.getWithProducts({
    sb,
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
