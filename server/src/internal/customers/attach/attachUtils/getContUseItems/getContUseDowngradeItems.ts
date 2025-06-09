import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { constructPreviewItem } from "@/internal/invoices/previewItemUtils/constructPreviewItem.js";
import { Proration } from "@/internal/invoices/prorationUtils.js";
import { getUsageFromBalance } from "@/internal/products/prices/priceUtils/arrearProratedUtils/getPrevAndNewUsages.js";
import { generateId } from "@/utils/genUtils.js";
import {
  FullEntitlement,
  FullCustomerEntitlement,
  PreviewLineItem,
  Price,
  InsertReplaceableSchema,
  usageToFeatureName,
} from "@autumn/shared";

import { attachParamsToProduct } from "../convertAttachParams.js";
import { priceToInvoiceItem } from "@/internal/products/prices/priceUtils/priceToInvoiceItem.js";
import { AttachReplaceableSchema } from "@shared/models/cusProductModels/cusEntModels/replaceableSchema.js";

export const getContUseDowngradeItems = async ({
  price,
  ent,
  prevCusEnt,
  attachParams,
  curItem,
  curUsage,
  proration,
  logger,
}: {
  price: Price;
  ent: FullEntitlement;
  prevCusEnt: FullCustomerEntitlement;
  attachParams: AttachParams;
  curItem: PreviewLineItem;
  curUsage: number;
  proration?: Proration;
  logger: any;
}) => {
  let now = attachParams.now || Date.now();
  let prevInvoiceItem = curItem;
  let prevBalance = prevCusEnt.entitlement.allowance! - curUsage;
  const product = attachParamsToProduct({ attachParams });
  const feature = prevCusEnt.entitlement.feature;

  let { usage: prevUsage, overage: prevOverage } = getUsageFromBalance({
    ent: prevCusEnt.entitlement,
    price,
    balance: prevBalance,
  });

  let { usage: newUsage, overage: newOverage } = getUsageFromBalance({
    ent,
    price,
    balance: prevBalance,
  });

  if (prevOverage == 0) {
    let { usage: newUsage } = getUsageFromBalance({
      ent,
      price,
      balance: ent.allowance! - curUsage,
    });

    let newItem = priceToInvoiceItem({
      price,
      ent,
      org: attachParams.org,
      usage: newUsage,
      prodName: product.name,
      proration,
      now,
      allowNegative: false,
    });

    return {
      oldItem: prevInvoiceItem,
      newItem,
      newUsageItem: null,
      replaceables: [],
    };
  }

  const newItem = priceToInvoiceItem({
    price,
    ent,
    org: attachParams.org,
    usage: newUsage,
    prodName: product.name,
    proration,
    now,
  });

  let numReplaceables = newUsage - prevUsage;

  let replaceables = Array.from({ length: numReplaceables }, (_, i) =>
    AttachReplaceableSchema.parse({
      ent: ent,
      id: generateId("rep"),
      created_at: Date.now(),
      delete_next_cycle: false,
    }),
  );

  const featureName = usageToFeatureName({
    usage: numReplaceables,
    feature,
  });

  let replaceableItem = constructPreviewItem({
    priceStr: `${numReplaceables} free ${featureName}`,
    price,
    description: `${product.name} - ${featureName}`,
  });

  return {
    oldItem: prevInvoiceItem,
    newItem,
    newUsageItem: replaceableItem,
    replaceables,
  };
};
