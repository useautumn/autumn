import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
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
}
