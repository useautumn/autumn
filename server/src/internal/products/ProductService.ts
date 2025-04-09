import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode, FullProduct, Price, Product } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";
import { getLatestProducts } from "./productUtils.js";

export class ProductService {
  // GET
  static async getById({
    sb,
    productId,
    orgId,
    env,
    version,
  }: {
    sb: SupabaseClient;
    productId: string;
    orgId: string;
    env: AppEnv;
    version?: number;
  }) {
    const query = sb
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("org_id", orgId)
      .eq("env", env);

    if (version) {
      query.eq("version", version);
    } else {
      query.order("version", { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      return null;
    }

    return data[0];
  }

  static async getByInternalId({
    sb,
    internalId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    internalId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("internal_id", internalId)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      throw error;
    }
    return data;
  }

  static async getFullDefaultProducts({
    sb,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("products")
      .select(
        "*, prices(*), entitlements(*, feature:features(*)), free_trial:free_trials(*)"
      )
      .eq("org_id", orgId)
      .eq("env", env)
      .eq("is_default", true)
      .eq("prices.is_custom", false)
      .eq("entitlements.is_custom", false)
      .eq("free_trial.is_custom", false);

    if (error) {
      throw error;
    }

    for (const product of data) {
      product.free_trial =
        product.free_trial.length > 0 ? product.free_trial[0] : null;
    }

    // Get latest version of each product
    let latestProducts = getLatestProducts(data);

    return latestProducts;
  }

  static async create({
    sb,
    product,
  }: {
    sb: SupabaseClient;
    product: Product;
  }) {
    const { data, error } = await sb.from("products").insert(product);
    if (error) {
      throw new RecaseError({
        message: "Failed to create product",
        code: ErrCode.InternalError,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }
    return data;
  }

  static async getProductStrict({
    sb,
    productId,
    orgId,
    env,
    version,
  }: {
    sb: SupabaseClient;
    productId: string;
    orgId: string;
    env: AppEnv;
    version?: number;
  }) {
    const query = sb
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("org_id", orgId)
      .eq("env", env);

    if (version) {
      query.eq("version", version);
    } else {
      query.order("version", { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      return null;
      // throw new RecaseError({
      //   message: `Product ${productId}${version ? ` (v${version})` : ""} not found`,
      //   code: ErrCode.ProductNotFound,
      //   statusCode: StatusCodes.NOT_FOUND,
      // });
    }

    return data[0];
  }

  static async getFullProducts({
    sb,
    orgId,
    env,
    inIds,
    returnAll = false,
  }: {
    sb: SupabaseClient;
    orgId: string;
    env: AppEnv;
    inIds?: string[];
    returnAll?: boolean;
  }) {
    const query = sb
      .from("products")
      .select(
        `*,
        entitlements (
          *,
          feature:features (*)
        ),
        prices(*),
        free_trial:free_trials(*)
      `
      )
      .eq("org_id", orgId)
      .eq("env", env)
      .eq("prices.is_custom", false)
      .eq("entitlements.is_custom", false)
      .eq("free_trial.is_custom", false)
      .order("created_at", { ascending: false })
      .order("id");

    if (inIds) {
      query.in("id", inIds);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    for (const product of data) {
      product.free_trial =
        product.free_trial.length > 0 ? product.free_trial[0] : null;
    }

    if (returnAll) {
      return data as FullProduct[];
    }

    // Get latest of each version
    const versionCounts = data.reduce((acc: any, product: any) => {
      if (!acc[product.id]) {
        acc[product.id] = 1;
      } else {
        acc[product.id]++;
      }
      return acc;
    }, {});
    const latestProducts = data.reduce((acc: any, product: any) => {
      if (!acc[product.id]) {
        acc[product.id] = product;
      } else if (product.version > acc[product.id].version) {
        acc[product.id] = product;
      }
      return acc;
    }, {});

    return Object.values(latestProducts) as FullProduct[];
  }

  static async getFullProduct({
    sb,
    productId,
    internalId,
    orgId,
    env,
    version,
  }: {
    sb: SupabaseClient;
    productId?: string;
    internalId?: string;
    orgId: string;
    env: AppEnv;
    version?: number;
  }) {
    const query = sb.from("products").select(
      ` *,
        free_trial:free_trials(*),
        entitlements (
          *,
          feature:features (id, name, type)
        ),
        prices (*)
      `
    );

    if (productId) {
      query.eq("id", productId);
    } else if (internalId) {
      query.eq("internal_id", internalId);
    }

    query
      .eq("org_id", orgId)
      .eq("env", env)
      .eq("prices.is_custom", false)
      .eq("entitlements.is_custom", false)
      .eq("free_trial.is_custom", false);

    if (version && productId) {
      query.eq("version", version);
    } else {
      query.order("version", { ascending: false }).limit(1);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      // Throw error?
      throw new RecaseError({
        message: `Product ${productId}${
          version ? ` (v${version})` : ""
        } not found`,
        code: ErrCode.ProductNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    let product = data[0];
    product.free_trial =
      product.free_trial.length > 0 ? product.free_trial[0] : null;
    return product;
  }

  static async getProductVersionCount({
    sb,
    productId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    productId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("products")
      .select("version")
      .eq("id", productId)
      .eq("org_id", orgId)
      .eq("env", env)
      .order("version", { ascending: false })
      .limit(1);

    if (error) {
      throw error;
    }

    if (data.length === 0) {
      throw new RecaseError({
        message: `Product ${productId} not found`,
        code: ErrCode.ProductNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    return data[0].version;
  }

  static async getEntitlementsByProductId({
    sb,
    internalProductId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    internalProductId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("entitlements")
      .select("*, feature:features(id, name, type)")
      .eq("internal_product_id", internalProductId)
      .eq("org_id", orgId)
      .eq("env", env);

    if (error) {
      throw error;
    }

    return data;
  }

  // UPDATES
  static async update({
    sb,
    internalId,
    update,
  }: {
    sb: SupabaseClient;
    internalId: string;
    update: any;
  }) {
    const { data, error } = await sb
      .from("products")
      .update(update)
      .eq("internal_id", internalId);

    if (error) {
      throw new RecaseError({
        message: `Error updating product...please try again later.`,
        code: ErrCode.InternalError,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }
  }

  // DELETES

  static async deleteByInternalId({
    sb,
    internalId,
    orgId,
    env,
  }: {
    sb: SupabaseClient;
    internalId: string;
    orgId: string;
    env: AppEnv;
  }) {
    const { data, error } = await sb
      .from("products")
      .delete()
      .eq("internal_id", internalId)
      .eq("org_id", orgId)
      .eq("env", env)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }
}

// static async deleteProduct({
//   sb,
//   productId,
//   orgId,
//   env,
// }: {
//   sb: SupabaseClient;
//   productId: string;
//   orgId: string;
//   env: AppEnv;
// }) {
//   const { error } = await sb
//     .from("products")
//     .delete()
//     .eq("id", productId)
//     .eq("org_id", orgId)
//     .eq("env", env);

//   if (error) {
//     throw error;
//   }
// }

// UNUSED
// static async getProducts(sb: SupabaseClient, orgId: string, env: AppEnv) {
//   const { data, error } = await sb
//     .from("products")
//     .select("*")
//     .eq("org_id", orgId)
//     .eq("env", env);

//   if (error) {
//     throw error;
//   }

//   return data;
// }
