import { ErrCode, Organization, UpdateProductSchema } from "@autumn/shared";
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

export const handleUpdateProductDetails = async ({
  newProduct,
  curProduct,
  org,
  sb,
  cusProductExists,
}: {
  curProduct: Product;
  newProduct: UpdateProduct;
  org: Organization;
  sb: SupabaseClient;
  cusProductExists: boolean;
}) => {
  // 1. Check if they're same
  // console.log("New product: ", newProduct);
  // throw new Error("test");
  
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

  if (newProduct.id !== curProduct.id && cusProductExists) {
    throw new RecaseError({
      message: "Cannot change product ID because it has existing customers",
      code: ErrCode.ProductHasCustomers,
      statusCode: 400,
    });
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
      ProductService.getFullProductStrict({
        sb,
        productId,
        orgId,
        env,
      }),
    ]);

    const cusProducts = await CusProductService.getByProductId(
      sb,
      fullProduct.internal_id
    );

    let cusProductExists = cusProducts.length > 0;

    if (!fullProduct) {
      throw new RecaseError({
        message: "Product not found",
        code: ErrCode.ProductNotFound,
        statusCode: 404,
      });
    }

    await handleUpdateProductDetails({
      sb,
      curProduct: fullProduct,
      newProduct: UpdateProductSchema.parse(req.body),
      org,
      cusProductExists,
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

    res.status(200).send({ message: "Product updated" });
    return;
  } catch (error) {
    handleRequestError({ req, error, res, action: "Update product" });
  }
}

