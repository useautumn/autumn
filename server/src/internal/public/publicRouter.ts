import { Router } from "express";
import { OrgService } from "../orgs/OrgService.js";
import {
  AppEnv,
  CusProductStatus,
  CustomerResponseSchema,
  ErrCode,
  FullProduct,
  Price,
  PriceType,
  Product,
  PublicEntitlementSchema,
  PublicProductSchema,
  UsagePriceConfig,
} from "@autumn/shared";
import { ProductService } from "../products/ProductService.js";
import { CusProductService } from "../customers/products/CusProductService.js";
import { processFullCusProduct } from "../customers/products/cusProductUtils.js";
import {
  getOptionsFromPrices,
  isProductUpgrade,
} from "../products/productUtils.js";
import { FeatureService } from "../features/FeatureService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import { CusService } from "../customers/CusService.js";
import { getCustomerDetails } from "../api/customers/cusRouter.js";

export const publicRouter = Router();

const publicRouterMiddleware = async (req: any, res: any, next: any) => {
  const pkey = req.headers["x-publishable-key"];

  if (!pkey) {
    console.log("No pkey:", pkey);
    return res.status(400).json({ message: "Publishable key is required" });
  }

  if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_live")) {
    console.log("Invalid pkey:", pkey);
    return res.status(400).json({ message: "Invalid publishable key" });
  }

  let env: AppEnv = pkey.startsWith("am_pk_test")
    ? AppEnv.Sandbox
    : AppEnv.Live;

  // 2. Get orgId from publishable key
  try {
    const org = await OrgService.getFromPkey({
      sb: req.sb,
      pkey: pkey,
      env: env,
    });
    req.org = org;
    req.env = env;
    next();
  } catch (error) {
    return res.status(400).json({ message: "Invalid publishable key" });
  }
};

publicRouter.use(publicRouterMiddleware);

const processProduct = (product: FullProduct) => {
  const ents = product.entitlements;
  const prices = product.prices;

  const fixedPrices = prices.filter(
    (p: Price) => p.config!.type === PriceType.Fixed
  );

  const usagePrices = prices.filter(
    (p: Price) => p.config!.type === PriceType.Usage
  );

  // const processdEnts = [];

  // for (const ent of ents) {
  //   const internalFeatureId = ent.internal_feature_id;

  //   const relatedPrice = prices.find((p: Price) => {
  //     let config = p.config as UsagePriceConfig;
  //     if (config.internal_feature_id === internalFeatureId) {
  //       return true;
  //     }
  //     return false;
  //   });

  //   const processedEnt: any = {
  //     ...ent,
  //   };
  //   if (relatedPrice) {
  //     processedEnt.price = relatedPrice.config;
  //   }
  //   processdEnts.push(PublicEntitlementSchema.parse(processedEnt));
  // }

  let processedProduct: any = structuredClone(product);
  // processedProduct.entitlements = processdEnts;
  processedProduct.fixed_prices = fixedPrices;
  processedProduct.usage_prices = usagePrices;
  delete processedProduct.prices;

  return PublicProductSchema.parse(processedProduct);
};

publicRouter.get("/customers/:customer_id", async (req: any, res: any) => {
  try {
    const customerId = req.params.customer_id;
    const customer = await CusService.getById({
      sb: req.sb,
      id: customerId,
      orgId: req.orgId,
      env: req.env,
    });

    if (!customer) {
      throw new RecaseError({
        message: `Customer ${customerId} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const { main, addOns, balances, invoices } = await getCustomerDetails({
      customer,
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
    });

    res.status(200).json({
      customer: CustomerResponseSchema.parse(customer),
      products: main,
      add_ons: addOns,
      entitlements: balances,
      invoices,
    });
  } catch (error) {
    handleRequestError({ error, res, action: "get customer" });
  }
});

publicRouter.get("/products", async (req: any, res: any) => {
  try {
    const products = await ProductService.getFullProducts(
      req.sb,
      req.org.id,
      req.env
    );

    // Order products by price
    products.sort((a: FullProduct, b: FullProduct) => {
      const isUpgrade = isProductUpgrade(a, b);
      if (isUpgrade) {
        return -1;
      }

      return 1;
    });

    const processedProducts = products.map(processProduct);

    res.status(200).json(processedProducts);
  } catch (error) {
    handleRequestError({ error, res, action: "Get public products" });
  }
});

publicRouter.get(
  "/customers/:customerId/products",
  async (req: any, res: any) => {
    const customerId = req.params.customerId;

    const cusProducts = await CusProductService.getFullByCustomerId({
      sb: req.sb,
      customerId,
      orgId: req.org.id,
      env: req.env,
      inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
    });

    if (!cusProducts || cusProducts.length === 0) {
      return res.status(200).json({
        main: [],
        add_ons: [],
      });
    }

    let main = [];
    let addOns = [];

    for (const cusProduct of cusProducts) {
      let processed = processFullCusProduct(cusProduct);

      let isAddOn = cusProduct.product.is_add_on;
      if (isAddOn) {
        addOns.push(processed);
      } else {
        main.push(processed);
      }
    }

    res.status(200).json({
      main,
      add_ons: addOns,
    });
  }
);

publicRouter.get(
  "/products/:product_id/options",
  async (req: any, res: any) => {
    const product = await ProductService.getFullProductStrict({
      sb: req.sb,
      productId: req.params.product_id,
      orgId: req.org.id,
      env: req.env,
    });

    const features = await FeatureService.getFeatures({
      sb: req.sb,
      orgId: req.org.id,
      env: req.env,
    });

    const prices = product.prices;

    const options = getOptionsFromPrices(prices, features);

    res.status(200).json(options);
  }
);
