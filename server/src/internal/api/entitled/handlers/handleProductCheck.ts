import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { getOrCreateCustomer } from "../../customers/cusUtils.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { CusProductStatus, FeatureType, FullCusProduct } from "@autumn/shared";
import { getUnlimitedAndUsageAllowed } from "@/internal/customers/entitlements/cusEntUtils.js";

export const handleProductCheck = async ({
  req,
  res,
}: {
  req: any;
  res: any;
}) => {
  const { customer_id, product_id, customer_data } = req.body;
  const { orgId, sb, env, logtail: logger } = req;

  // 1. Get customer and org
  let [customer, org] = await Promise.all([
    getOrCreateCustomer({
      sb,
      orgId,
      env,
      customerId: customer_id,
      customerData: customer_data,
      logger,
      orgSlug: req.minOrg?.slug,
    }),
    OrgService.getFromReq(req),
  ]);

  // 2. Get cus products
  const cusProducts = await CusService.getFullCusProducts({
    sb,
    internalCustomerId: customer.internal_id,
    withProduct: true,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
  });

  let cusProduct = cusProducts.find(
    (cusProduct: FullCusProduct) => cusProduct.product.id === product_id
  );

  if (!cusProduct) {
    res.status(200).json({
      customer_id,
      product_id,
      allowed: false,
      balances: [],
    });
    return;
  }

  // 4. Get balances
  let balances: any = {};
  let cusEnts = cusProduct.customer_entitlements;
  for (let cusEnt of cusEnts) {
    let feature = cusEnt.entitlement.feature;
    let isBoolean = feature.type === FeatureType.Boolean;
    let { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
      cusEnts,
      internalFeatureId: feature.internal_id,
    });

    if (isBoolean) {
      balances[feature.id] = {
        feature_id: feature.id,
        balance: unlimited ? null : cusEnt.balance,
      };
      continue;
    }

    if (unlimited) {
      balances[feature.id] = {
        feature_id: feature.id,
        unlimited: true,
        usage_allowed: usageAllowed,
        balance: null,
      };
      continue;
    }

    if (!balances[feature.id]) {
      // Initialize
      balances[feature.id] = {
        feature_id: feature.id,
        balance: cusEnt.balance,
        usage_allowed: usageAllowed,
        unlimited: false,
      };
    } else {
      // Update
      balances[feature.id].balance += cusEnt.balance;
      balances[feature.id].usage_allowed = usageAllowed;
    }
  }

  res.status(200).json({
    customer_id,
    product_id,
    allowed: true,
    balances: Object.values(balances),
  });
};
