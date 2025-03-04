import RecaseError from "@/utils/errorUtils.js";
import {
  CustomerEntitlement,
  ErrCode,
  FullCustomerEntitlement,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";

export class CusPriceService {
  static async getByCusProductId({
    sb,
    customerProductId,
  }: {
    sb: SupabaseClient;
    customerProductId: string;
  }) {
    const { data, error } = await sb
      .from("customer_prices")
      .select("*, price:prices(*)")
      .eq("customer_product_id", customerProductId);

    if (error) {
      throw new RecaseError({
        message: "Error getting customer prices",
        code: ErrCode.GetCusPriceFailed,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }

    return data;
  }

  static async getRelatedToCusEnt({
    sb,
    cusEnt,
  }: {
    sb: SupabaseClient;
    cusEnt: FullCustomerEntitlement;
  }) {
    const { data, error } = await sb
      .from("customer_prices")
      .select("*, price:prices!inner(*)")
      .eq("customer_product_id", cusEnt.customer_product_id)
      .eq(
        "price.config->>internal_feature_id",
        cusEnt.entitlement.internal_feature_id
      );

    if (error) {
      throw new RecaseError({
        message: "Error getting customer prices",
        code: ErrCode.GetCusPriceFailed,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        data: error,
      });
    }

    if (data.length === 0) {
      throw new RecaseError({
        message: `No customer price found for usage based entitlement ${cusEnt.entitlement.internal_feature_id}`,
        code: ErrCode.CusPriceNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    return data[0];
  }
}
