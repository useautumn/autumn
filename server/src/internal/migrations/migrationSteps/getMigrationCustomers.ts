import {
  CusProductStatus,
  ErrCode,
  MigrationJobStep,
  Product,
} from "@autumn/shared";
import { MigrationService } from "../MigrationService.js";
import RecaseError from "@/utils/errorUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { customerProducts } from "@autumn/shared";
import { and, asc, eq, gt, inArray } from "drizzle-orm";

const getAllCustomersOnProduct = async ({
  db,
  internalProductId,
}: {
  db: DrizzleCli;
  internalProductId: string;
}) => {
  let allData: any[] = [];
  const PAGE_SIZE = 1000;
  let lastId: string | null = null;

  while (true) {
    let data;
    try {
      data = await db.query.customerProducts.findMany({
        where: and(
          eq(customerProducts.internal_product_id, internalProductId),
          inArray(customerProducts.status, [
            CusProductStatus.Active,
            CusProductStatus.PastDue,
          ]),
          lastId ? gt(customerProducts.id, lastId) : undefined,
        ),
        with: {
          customer: true,
        },
        orderBy: [asc(customerProducts.id)],
        limit: PAGE_SIZE,
      });
    } catch (error) {
      throw new RecaseError({
        message: "Error getting customers on product",
        code: ErrCode.GetCusProductsFailed,
        data: error,
      });
    }

    if (!data || data.length === 0) break;

    let filtered = data.reduce((acc: any[], curr: any) => {
      const existingIndex = acc.findIndex(
        (item) => item.customer.id === curr.customer.id,
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
  db,
  migrationJobId,
  fromProduct,
  logger,
}: {
  db: DrizzleCli;
  migrationJobId: string;
  fromProduct: Product;
  logger: any;
}) => {
  await MigrationService.updateJob({
    db,
    migrationJobId,
    updates: {
      current_step: MigrationJobStep.GetCustomers,
    },
  });

  let { cusProducts } = await getAllCustomersOnProduct({
    db,
    internalProductId: fromProduct.internal_id,
  });

  let totalCount = cusProducts.length;
  let canceledCount = cusProducts.filter(
    (cusProd) => cusProd.canceled_at !== null,
  ).length;

  let customCount = cusProducts.filter((cusProd) => cusProd.is_custom).length;

  let filteredCusProducts = cusProducts.filter(
    (cusProd) => cusProd.canceled_at === null && !cusProd.is_custom,
  );

  let customers = filteredCusProducts.map((cusProd) => cusProd.customer);

  await MigrationService.updateJob({
    db,
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
