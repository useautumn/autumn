import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachBody } from "../../models/AttachBody.js";
import RecaseError from "@/utils/errorUtils.js";
import {
  CreateFreeTrial,
  CusProductStatus,
  Entitlement,
  ErrCode,
  FullCustomer,
  FullProduct,
  Price,
} from "@autumn/shared";
import { ProductService } from "@/internal/products/ProductService.js";
import { notNullish } from "@/utils/genUtils.js";
import { getOrCreateCustomer } from "../../../cusUtils/getOrCreateCustomer.js";
import { getExistingCusProducts } from "../../../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { mapOptionsList } from "../mapOptionsList.js";
import {
  getFreeTrialAfterFingerprint,
  handleNewFreeTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";
import {
  cusProductToEnts,
  cusProductToPrices,
} from "../../../cusProducts/cusProductUtils/convertCusProduct.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import { isMainProduct } from "@/internal/products/productUtils/classifyProduct.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeCusData } from "./attachParamsUtils/getStripeCusData.js";
import { isOneOff } from "@/internal/products/productUtils.js";

const getProductsForAttach = async ({
  req,
  attachBody,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
}) => {
  const { product_id, product_ids, version } = attachBody;

  let products = await ProductService.listFull({
    db: req.db,
    orgId: req.orgId,
    env: req.env,
    inIds: product_ids || [product_id!],
    version,
  });

  if (notNullish(product_ids)) {
    let freeTrialProds = products.filter((prod) => notNullish(prod.free_trial));
    if (freeTrialProds.length > 0) {
      throw new RecaseError({
        message:
          "When providing product_ids, can't have multiple free trial products",
        code: ErrCode.InvalidRequest,
      });
    }

    for (const prod of products) {
      let otherProd = products.find(
        (p) => p.group === prod.group && !p.is_add_on && p.id !== prod.id,
      );

      if (otherProd && !otherProd.is_add_on && !isOneOff(prod.prices)) {
        throw new RecaseError({
          message:
            "Can't attach multiple products from the same group that are not add-ons",
          code: ErrCode.InvalidRequest,
        });
      }
    }
  }

  return products;
};

const getCustomerAndProducts = async ({
  req,
  attachBody,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
}) => {
  const [customer, products] = await Promise.all([
    getOrCreateCustomer({
      req,
      customerId: attachBody.customer_id,
      customerData: attachBody.customer_data,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.Scheduled,
        CusProductStatus.PastDue,
      ],
      withEntities: true,
      entityId: attachBody.entity_id,
      entityData: attachBody.entity_data,
    }),
    getProductsForAttach({ req, attachBody }),
  ]);

  return { customer, products };
};

const getPricesAndEnts = async ({
  req,
  attachBody,
  customer,
  products,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
  customer: FullCustomer;
  products: FullProduct[];
}) => {
  const { options: optionsInput, is_custom, items, free_trial } = attachBody;
  const { features, db, org, logtail: logger } = req;

  const { curMainProduct, curSameProduct } = getExistingCusProducts({
    product: products[0],
    cusProducts: customer.customer_products,
    internalEntityId: customer.entity?.internal_id,
  });

  // Not custom
  if (!is_custom) {
    let prices = products.flatMap((p: FullProduct) => p.prices);
    let entitlements = products.flatMap((p: FullProduct) => p.entitlements);

    let freeTrial = null;
    let freeTrialProduct = products.find((p) => notNullish(p.free_trial));
    if (freeTrialProduct) {
      freeTrial = await getFreeTrialAfterFingerprint({
        db,
        freeTrial: freeTrialProduct.free_trial,
        fingerprint: customer.fingerprint,
        internalCustomerId: customer.internal_id,
        multipleAllowed: org.config.multiple_trials,
        productId: freeTrialProduct.id,
      });
    }

    const prodIsMain = isMainProduct({ product: products[0], prices });

    return {
      optionsList: mapOptionsList({
        optionsInput,
        features,
        prices,
        curCusProduct: curMainProduct,
      }),
      prices,
      entitlements,
      freeTrial,
      cusProducts: customer.customer_products,
    };
  }

  const product = products[0];

  let curPrices: Price[] = product!.prices;
  let curEnts: Entitlement[] = product!.entitlements;

  if (curMainProduct?.product.id === product.id) {
    curPrices = cusProductToPrices({ cusProduct: curMainProduct });
    curEnts = cusProductToEnts({ cusProduct: curMainProduct });
  }

  let {
    prices,
    entitlements: ents,
    customPrices,
    customEnts,
  } = await handleNewProductItems({
    db,
    curPrices,
    curEnts,
    newItems: attachBody.items || [],
    features,
    product,
    logger,
    isCustom: true,
  });

  const freeTrial = await handleNewFreeTrial({
    db,
    curFreeTrial: product!.free_trial,
    newFreeTrial: (free_trial as CreateFreeTrial) || null,
    internalProductId: product!.internal_id,
    isCustom: true,
  });

  const uniqueFreeTrial = await getFreeTrialAfterFingerprint({
    db,
    freeTrial: freeTrial,
    fingerprint: customer.fingerprint,
    internalCustomerId: customer.internal_id,
    multipleAllowed: org.config.multiple_trials,
    productId: product.id,
  });

  const prodIsMain = isMainProduct({ product: products[0], prices });

  return {
    optionsList: mapOptionsList({
      optionsInput,
      features,
      prices,
      curCusProduct: curMainProduct,
    }),
    prices,
    entitlements: getEntsWithFeature({
      ents,
      features,
    }),
    freeTrial: uniqueFreeTrial,
    customPrices,
    customEnts,
  };
};

export const processAttachBody = async ({
  req,
  attachBody,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
}) => {
  // 1. Get customer and products
  const { org, env } = req;

  const { customer, products } = await getCustomerAndProducts({
    req,
    attachBody,
  });

  const stripeCli = createStripeCli({ org, env });
  let stripeCusData = await getStripeCusData({
    stripeCli,
    stripeId: customer.processor?.id,
  });

  const { stripeCus, paymentMethod, now } = stripeCusData;

  const {
    optionsList,
    prices,
    entitlements,
    freeTrial,
    customPrices,
    customEnts,
  } = await getPricesAndEnts({
    req,
    attachBody,
    customer,
    products,
  });

  return {
    customer,
    products,
    optionsList,
    prices,
    entitlements,
    freeTrial,
    customPrices,
    customEnts,

    // Additional data
    stripeVars: {
      stripeCli,
      stripeCus,
      paymentMethod,
      now,
    },
  };
};
