import {
  ErrCode,
  Organization,
  RewardProgram,
  UpdateProductSchema,
} from "@autumn/shared";
import { UpdateProduct } from "@autumn/shared";
import { Product } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { ProductService } from "../../products/ProductService.js";
import { notNullish } from "@/utils/genUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { handleNewFreeTrial } from "@/internal/products/free-trials/freeTrialUtils.js";
import { handleNewEntitlements } from "@/internal/products/entitlements/entitlementUtils.js";
import { handleNewPrices } from "@/internal/prices/priceInitUtils.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  handleVersionProduct,
  handleVersionProductV2,
} from "./handleVersionProduct.js";
import { productsAreDifferent } from "@/internal/products/productUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemInitUtils.js";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";

export const handleUpdateProductDetails = async ({
  newProduct,
  curProduct,
  org,
  sb,
  cusProductExists,
  rewardPrograms,
}: {
  curProduct: Product;
  newProduct: UpdateProduct;
  org: Organization;
  sb: SupabaseClient;
  cusProductExists: boolean;
  rewardPrograms: RewardProgram[];
}) => {
  // 1. Check if they're same
  // console.log("New product: ", newProduct);
  // throw new Error("test");

  let customersOnAllVersions = await CusProductService.getByProductId(
    sb,
    curProduct.id
  );

  const productsAreSame = (prod1: Product, prod2: UpdateProduct) => {
    if (notNullish(prod2.id) && prod1.id != prod2.id) {
      return false;
    }

    if (notNullish(prod2.name) && prod1.name != prod2.name) {
      return false;
    }

    if (notNullish(prod2.group) && prod1.group != prod2.group) {
      return false;
    }

    if (notNullish(prod2.is_add_on) && prod1.is_add_on != prod2.is_add_on) {
      return false;
    }

    if (notNullish(prod2.is_default) && prod1.is_default != prod2.is_default) {
      return false;
    }

    return true;
  };

  if (productsAreSame(curProduct, newProduct)) {
    return;
  }

  if (newProduct.id !== curProduct.id) {
    if (customersOnAllVersions.length > 0) {
      throw new RecaseError({
        message: "Cannot change product ID because it has existing customers",
        code: ErrCode.ProductHasCustomers,
        statusCode: 400,
      });
    }

    if (rewardPrograms.length > 0) {
      throw new RecaseError({
        message:
          "Cannot change product ID because existing reward programs are linked to it",
        code: ErrCode.ProductHasRewardPrograms,
        statusCode: 400,
      });
    }
  }

  console.log(`Updating product ${curProduct.id} (org: ${org.slug})`);

  // 2. Update product
  await ProductService.update({
    sb,
    internalId: curProduct.internal_id,
    update: {
      id: newProduct.id,
      name: newProduct.name,
      group: newProduct.group,
      is_add_on: newProduct.is_add_on,
      is_default: newProduct.is_default,
    },
  });

  curProduct.name = newProduct.name || curProduct.name;
  curProduct.group = newProduct.group || curProduct.group;
  curProduct.is_add_on = newProduct.is_add_on || curProduct.is_add_on;
  curProduct.is_default = newProduct.is_default || curProduct.is_default;
};

export const handleUpdateProduct = async (req: any, res: any) => {
  const { productId } = req.params;
  const sb = req.sb;
  const orgId = req.orgId;
  const env = req.env;

  const { prices, entitlements, free_trial } = req.body;

  try {
    const [features, org, fullProduct] = await Promise.all([
      FeatureService.getFromReq(req),
      OrgService.getFullOrg({
        sb,
        orgId,
      }),
      ProductService.getFullProduct({
        sb,
        productId,
        orgId,
        env,
      }),
    ]);

    if (!fullProduct) {
      throw new RecaseError({
        message: "Product not found",
        code: ErrCode.ProductNotFound,
        statusCode: 404,
      });
    }

    const cusProductsCurVersion =
      await CusProductService.getByInternalProductId(
        sb,
        fullProduct.internal_id
      );

    let cusProductExists = cusProductsCurVersion.length > 0;

    await handleUpdateProductDetails({
      sb,
      curProduct: fullProduct,
      newProduct: UpdateProductSchema.parse(req.body),
      org,
      cusProductExists,
      rewardPrograms: [],
    });

    let productHasChanged = productsAreDifferent({
      product1: fullProduct,
      product2: {
        ...fullProduct,
        prices: notNullish(prices) ? prices : fullProduct.prices,
        entitlements: notNullish(entitlements)
          ? entitlements
          : fullProduct.entitlements,
        free_trial:
          free_trial !== undefined ? free_trial : fullProduct.free_trial,
      },
    });

    if (cusProductExists && productHasChanged) {
      await handleVersionProduct({
        req,
        res,
        sb,
        latestProduct: fullProduct,
        org,
        env,
        prices,
        entitlements,
        freeTrial: free_trial,
      });
      return;
    }

    if (free_trial !== undefined) {
      await handleNewFreeTrial({
        sb,
        curFreeTrial: fullProduct.free_trial,
        newFreeTrial: free_trial,
        internalProductId: fullProduct.internal_id,
        isCustom: false,
      });
    }

    // 1. Handle changing of entitlements
    if (notNullish(entitlements)) {
      await handleNewEntitlements({
        sb,
        newEnts: entitlements,
        curEnts: fullProduct.entitlements,
        features,
        orgId,
        internalProductId: fullProduct.internal_id,
        isCustom: false,
        prices,
      });
    }

    if (notNullish(prices)) {
      await handleNewPrices({
        sb,
        newPrices: prices,
        curPrices: fullProduct.prices,
        entitlements,
        internalProductId: fullProduct.internal_id,
        isCustom: false,
        features,
        product: fullProduct,
        env,
        org,
      });
    }

    res.status(200).json({ message: "Product updated" });
    return;
  } catch (error) {
    handleRequestError({ req, error, res, action: "Update product" });
  }
};

// Update product v2
export const handleUpdateProductV2 = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "Update product",
    handler: async () => {
      const { productId } = req.params;
      const { sb, orgId, env, logtail: logger } = req;

      const [features, org, fullProduct, rewardPrograms] = await Promise.all([
        FeatureService.getFromReq(req),
        OrgService.getFullOrg({
          sb,
          orgId,
        }),
        ProductService.getFullProduct({
          sb,
          productId,
          orgId,
          env,
        }),
        RewardProgramService.getByProductId({
          sb,
          productIds: [productId],
          orgId,
          env,
        }),
      ]);

      if (!fullProduct) {
        throw new RecaseError({
          message: "Product not found",
          code: ErrCode.ProductNotFound,
          statusCode: 404,
        });
      }

      // 1. Update product details
      // Get reward programs using product id
      const cusProductsCurVersion =
        await CusProductService.getByInternalProductId(
          sb,
          fullProduct.internal_id
        );

      let cusProductExists = cusProductsCurVersion.length > 0;

      await handleUpdateProductDetails({
        sb,
        curProduct: fullProduct,
        newProduct: UpdateProductSchema.parse(req.body),
        org,
        cusProductExists,
        rewardPrograms,
      });

      // 1. Map to product items
      // Check if product items are different

      let itemsExist = notNullish(req.body.items);
      if (cusProductExists && itemsExist) {
        await handleVersionProductV2({
          req,
          res,
          sb,
          latestProduct: fullProduct,
          org,
          env,
          items: req.body.items,
          freeTrial: req.body.free_trial,
        });
        return;
      }

      const { items, free_trial } = req.body;

      await handleNewProductItems({
        sb,
        curPrices: fullProduct.prices,
        curEnts: fullProduct.entitlements,
        newItems: items,
        features,
        product: fullProduct,
        logger,
        isCustom: false,
      });

      if (free_trial !== undefined) {
        await handleNewFreeTrial({
          sb,
          curFreeTrial: fullProduct.free_trial,
          newFreeTrial: free_trial,
          internalProductId: fullProduct.internal_id,
          isCustom: false,
        });
      }

      res.status(200).send({ message: "Product updated" });
      return;
    },
  });
