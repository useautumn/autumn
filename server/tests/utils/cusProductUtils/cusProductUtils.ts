import { Autumn } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
  AppEnv,
  CusProductStatus,
  FullCusProduct,
  FullCustomerEntitlement,
} from "@autumn/shared";
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
  let customer = await CusService.getById({
    sb,
    id: customerId,
    orgId: orgId,
    env: env,
    logger: console,
  });

  let cusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId: customer.internal_id!,
    withProduct: true,
    withPrices: true,
    inStatuses: [CusProductStatus.Active],
  });

  let mainCusProduct = cusProducts.find(
    (cusProduct: FullCusProduct) => !cusProduct.product.is_add_on
  );

  return mainCusProduct || null;
};
