import {
  CusProductStatus,
  ErrCode,
  MigrationJobStep,
  Product,
} from "@autumn/shared";
import { MigrationService } from "../MigrationService.js";
import RecaseError from "@/utils/errorUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";

const getAllCustomersOnProduct = async ({
  sb,
  internalProductId,
}: {
  sb: any; // Replace 'any' with your actual Supabase client type
  internalProductId: string;
}) => {
  let allData: any[] = [];
  const PAGE_SIZE = 1000;
  let lastId: string | null = null;

  while (true) {
    let query = sb
      .from("customer_products")
      .select("*, customer:customers!inner(*)")
      .eq("internal_product_id", internalProductId)
      .in("status", [CusProductStatus.Active, CusProductStatus.PastDue])
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (lastId) {
      query = query.gt("id", lastId);
    }

    const { data, error } = await query;

    // If query error
    if (error) {
      throw new RecaseError({
        message: "Error getting customers on product",
        code: ErrCode.GetCusProductsFailed,
        data: error,
      });
    }

    if (!data || data.length === 0) break;

    let filtered = data.reduce((acc: any[], curr: any) => {
      const existingIndex = acc.findIndex(
        (item) => item.customer.id === curr.customer.id
      );
      if (existingIndex === -1) {
        acc.push(curr);
      } else if (
        new Date(curr.created_at) > new Date(acc[existingIndex].created_at)
      ) {
        acc[existingIndex] = curr;
      }
      return acc;
    }, []);

    allData = [...allData, ...filtered];
    lastId = data[data.length - 1].id;

    if (data.length < PAGE_SIZE) break;
  }

  return { cusProducts: allData, error: null };
};

export const getMigrationCustomers = async ({
  sb,
  migrationJobId,
  fromProduct,
  logger,
}: {
  sb: SupabaseClient;
  migrationJobId: string;
  fromProduct: Product;
  logger: any;
}) => {
  await MigrationService.updateJob({
    sb,
    migrationJobId,
    updates: {
      current_step: MigrationJobStep.GetCustomers,
    },
  });

  let { cusProducts, error } = await getAllCustomersOnProduct({
    sb,
    internalProductId: fromProduct.internal_id,
  });

  let totalCount = cusProducts.length;
  let canceledCount = cusProducts.filter(
    (cusProd) => cusProd.canceled_at !== null
  ).length;

  let customCount = cusProducts.filter((cusProd) => cusProd.is_custom).length;

  let filteredCusProducts = cusProducts.filter(
    (cusProd) => cusProd.canceled_at === null && !cusProd.is_custom
  );

  let customers = filteredCusProducts.map((cusProd) => cusProd.customer);

  await MigrationService.updateJob({
    sb,
    migrationJobId,
    updates: {
      step_details: {
        [MigrationJobStep.GetCustomers]: {
          total_customers: totalCount,
          canceled_customers: canceledCount,
          custom_customers: customCount,
          migration_customers: filteredCusProducts.length,
        },
      },
    },
  });

  return customers;
};
