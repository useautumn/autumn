import { notNullish, nullish } from "@/utils/genUtils.js";
import { CusProductStatus, ProductV2 } from "@autumn/shared";
import { Customer } from "autumn-js";
import { expect } from "chai";
import { Decimal } from "decimal.js";

export const expectProductAttached = ({
  customer,
  product,
  status,
  entityId,
}: {
  customer: Customer;
  product: ProductV2;
  status?: CusProductStatus;
  entityId?: string;
}) => {
  const cusProducts = customer.products;
  const productAttached = cusProducts.find((p) => p.id === product.id);

  if (!productAttached) {
    console.log(`product ${product.id} not attached`);
    console.log(cusProducts);
  }

  expect(productAttached, `product ${product.id} is attached`).to.exist;

  if (status) {
    expect(productAttached?.status).to.equal(
      status,
      `product ${product.id} should have status ${status}`,
    );
  } else {
    expect(
      productAttached?.status,
      `product ${product.id} is not expired`,
    ).to.not.equal(CusProductStatus.Expired);
  }

  if (entityId) {
    // @ts-ignore
    expect(productAttached?.entity_id).to.equal(entityId);
  }
};

export const expectInvoicesCorrect = ({
  customer,
  first,
  second,
}: {
  customer: Customer;
  first?: {
    productId: string;
    total: number;
  };
  second?: {
    productId: string;
    total: number;
  };
}) => {
  const invoices = customer.invoices;
  if (!invoices) {
    console.log(`invoices is nullish`);
  }

  if (first) {
    try {
      expect(invoices![0].total).to.approximately(
        first.total,
        0.01,
        `invoice total is correct: ${first.total}`,
      );

      expect(invoices![0].product_ids).to.include(
        first.productId,
        `invoice includes product ${first.productId}`,
      );
    } catch (error) {
      console.log(`invoice for ${first.productId}, ${first.total} not found`);
      throw error;
    }
  }

  if (second) {
    const totalAmount = new Decimal(invoices![0].total)
      .plus(invoices![1].total)
      .toDecimalPlaces(2)
      .toNumber();
    // console.log("First invoice:", invoices![0].total, invoices![0].product_ids);
    // console.log(
    //   "Second invoice:",
    //   invoices![1].total,
    //   invoices![1].product_ids,
    // );
    try {
      expect(
        totalAmount == second.total,
        `first & second invoice total should sum to ${second.total}`,
      ).to.be.true;
      expect(
        invoices![0].product_ids.includes(second.productId),
        `invoice 1 includes product ${second.productId}`,
      ).to.be.true;
      expect(
        invoices![1].product_ids.includes(second.productId),
        `invoice 2 includes product ${second.productId}`,
      ).to.be.true;
    } catch (error) {
      console.log(`invoice for ${second.productId}, ${second.total} not found`);
      throw error;
    }
  }
};
