import { notNullish, nullish } from "@/utils/genUtils.js";
import { CusProductStatus, ProductV2 } from "@autumn/shared";
import { Customer } from "autumn-js";
import { expect } from "chai";
import { Decimal } from "decimal.js";

export const expectProductAttached = ({
  customer,
  product,
  productId,
  status,
  entityId,
  isCanceled = false,
  quantity,
}: {
  customer: Customer;
  product?: ProductV2;
  productId?: string;
  status?: CusProductStatus;
  entityId?: string;
  isCanceled?: boolean;
  quantity?: number;
}) => {
  const cusProducts = customer.products;
  const finalProductId = productId || product?.id;
  const productAttached = cusProducts.find(
    (p) =>
      p.id === finalProductId && (entityId ? p.entity_id === entityId : true)
  );

  if (!productAttached) {
    console.log(`product ${finalProductId} not attached`);
    console.log(cusProducts);
  }

  expect(productAttached, `product ${finalProductId} is attached`).to.exist;

  if (status) {
    expect(productAttached?.status).to.equal(
      status,
      `product ${finalProductId} should have status ${status}`
    );
  } else {
    expect(
      productAttached?.status,
      `product ${finalProductId} is not expired`
    ).to.not.equal(CusProductStatus.Expired);
  }

  if (quantity) {
    // @ts-ignore
    expect(productAttached?.quantity).to.equal(quantity);
  }

  if (entityId) {
    // @ts-ignore
    expect(productAttached?.entity_id).to.equal(entityId);
  }

  if (isCanceled) {
    expect(productAttached?.canceled_at).to.exist;
    // @ts-ignore
    // expect(productAttached?.canceled).to.be.true;
  }
};

export const expectInvoicesCorrect = ({
  customer,
  first,
  // second,
}: {
  customer: Customer;
  first: {
    productId: string;
    total: number;
  };
  // second?: {
  //   productId: string;
  //   total: number;
  // };
}) => {
  const invoices = customer.invoices;
  if (!invoices) {
    console.log(`invoices is nullish`);
  }

  try {
    expect(invoices![0].total).to.approximately(
      first.total,
      0.01,
      `invoice total is correct: ${first.total}`
    );

    expect(invoices![0].product_ids).to.include(
      first.productId,
      `invoice includes product ${first.productId}`
    );
  } catch (error) {
    console.log(`invoice for ${first.productId}, ${first.total} not found`);
    throw error;
  }

  // if (first) {

  // }

  // if (second) {
  //   const totalAmount = new Decimal(invoices![0].total)
  //     .plus(invoices![1].total)
  //     .toDecimalPlaces(2)
  //     .toNumber();
  //   // console.log("First invoice:", invoices![0].total, invoices![0].product_ids);
  //   // console.log(
  //   //   "Second invoice:",
  //   //   invoices![1].total,
  //   //   invoices![1].product_ids,
  //   // );
  //   try {
  //     expect(totalAmount).to.approximately(
  //       second.total,
  //       0.01,
  //       `first & second invoice total should sum to ${second.total}`,
  //     );
  //     expect(
  //       invoices![0].product_ids.includes(second.productId),
  //       `invoice 1 includes product ${second.productId}`,
  //     ).to.be.true;
  //     expect(
  //       invoices![1].product_ids.includes(second.productId),
  //       `invoice 2 includes product ${second.productId}`,
  //     ).to.be.true;
  //   } catch (error) {
  //     console.log(`invoice for ${second.productId}, ${second.total} not found`);
  //     throw error;
  //   }
  // }
};
