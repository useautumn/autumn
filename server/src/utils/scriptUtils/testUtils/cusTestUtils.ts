import { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import { Organization } from "@autumn/shared";
import { AppEnv } from "autumn-js";

export const getCusSub = async ({
  db,
  org,
  customerId,
  productId,
}: {
  db: DrizzleCli;
  org: Organization;
  customerId: string;
  productId: string;
}) => {
  const env = AppEnv.Sandbox;
  const stripeCli = createStripeCli({ org, env });
  const fullCus = await CusService.getFull({
    db,
    idOrInternalId: customerId,
    env,
    orgId: org.id,
  });

  let cusProduct = fullCus.customer_products.find(
    (cp) => cp.product.id == productId
  );

  const sub = await cusProductToSub({ cusProduct, stripeCli });
  return sub;
};
