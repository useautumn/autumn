import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { FeatureOptions, ProductV2 } from "@autumn/shared";
import { getAttachTotal } from "tests/utils/testAttachUtils/testAttachUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectInvoicesCorrect } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectProductAttached.js";
import { notNullish } from "@/utils/genUtils.js";

export const runAttachTest = async ({
  autumn,
  customerId,
  product,
  options,
}: {
  autumn: AutumnInt;
  customerId: string;
  product: ProductV2;
  options?: FeatureOptions[];
}) => {
  const res = await autumn.attachPreview({
    customerId,
    productId: product.id,
  });

  const total = getAttachTotal({
    preview: res,
    options,
  });

  const res2 = await autumn.attach({
    customerId,
    productId: product.id,
    options,
  });

  const customer = await autumn.customers.get(customerId);

  expectProductAttached({
    customer,
    product,
  });

  let intervals = Array.from(
    new Set(product.items.map((item) => item.interval)),
  ).filter(notNullish);
  const multiInterval = intervals.length > 1;

  expectInvoicesCorrect({
    customer,
    first: multiInterval ? undefined : { productId: product.id, total },
    second: multiInterval ? { productId: product.id, total } : undefined,
  });

  expectFeaturesCorrect({
    customer,
    product,
  });
};

export const addPrefixToProducts = ({
  products,
  prefix,
}: {
  products: ProductV2[];
  prefix: string;
}) => {
  for (const product of products) {
    product.id = `${prefix}_${product.id}`;
    product.name = `${prefix} ${product.name}`;
  }

  return products;
};
