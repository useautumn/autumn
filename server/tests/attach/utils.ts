import type { BillingInterval, ProductItem, ProductV2 } from "@autumn/shared";
import { nullish } from "@/utils/genUtils.js";

// export const runAttachTest = async ({
//   autumn,
//   customerId,
//   entityId,
//   product,
//   options,
//   stripeCli,
//   db,
//   org,
//   env,
//   usage,
//   waitForInvoice = 0,
//   isCanceled = false,
//   skipFeatureCheck = false,
//   singleInvoice = false,
//   skipSubCheck = false,
//   entities,
// }: {
//   autumn: AutumnInt;
//   customerId: string;
//   entityId?: string;
//   product: ProductV2;
//   options?: FeatureOptions[];
//   stripeCli: Stripe;
//   db: DrizzleCli;
//   org: Organization;
//   env: AppEnv;
//   usage?: {
//     featureId: string;
//     value: number;
//   }[];
//   waitForInvoice?: number;
//   isCanceled?: boolean;
//   skipFeatureCheck?: boolean;
//   singleInvoice?: boolean;
//   skipSubCheck?: boolean;
//   entities?: CreateEntity[];
// }) => {
//   const preview = await autumn.attachPreview({
//     customer_id: customerId,
//     product_id: product.id,
//     entity_id: entityId,
//   });

//   const total = getAttachTotal({
//     preview,
//     options,
//   });

//   await autumn.attach({
//     customer_id: customerId,
//     product_id: product.id,
//     entity_id: entityId,
//     options: toSnakeCase(options),
//   });

//   if (waitForInvoice) {
//     await timeout(waitForInvoice);
//   }

//   const customer = await autumn.customers.get(customerId);

//   const productCount = customer.products.reduce((acc: number, p: any) => {
//     if (product.group == p.group) {
//       return acc + 1;
//     } else return acc;
//   }, 0);

//   expect(
//     productCount,
//     `customer should only have 1 product (from this group: ${product.group})`
//   ).to.equal(1);

//   expectProductAttached({
//     customer,
//     product,
//     entityId,
//   });

//   let intervals = Array.from(
//     new Set(product.items.map((item) => item.interval))
//   ).filter(notNullish);
//   const multiInterval = intervals.length > 1;

//   const freeProduct = isFreeProductV2({ product });
//   if (!freeProduct) {
//     let multiInvoice = !singleInvoice && multiInterval;
//     expectInvoicesCorrect({
//       customer,
//       first: multiInvoice ? undefined : { productId: product.id, total },
//       second: multiInvoice ? { productId: product.id, total } : undefined,
//     });
//   }

//   if (!skipFeatureCheck) {
//     expectFeaturesCorrect({
//       customer,
//       product,
//       usage,
//       options,
//       entities,
//     });
//   }

//   const branch = preview.branch;
//   if (branch == AttachBranch.OneOff || freeProduct) {
//     return;
//   }

//   if (skipSubCheck) return;

//   await expectSubItemsCorrect({
//     stripeCli,
//     customerId,
//     product,
//     db,
//     org,
//     env,
//     isCanceled,
//   });

//   const stripeSubs = await stripeCli.subscriptions.list({
//     customer: customer.stripe_id!,
//   });
//   if (multiInterval) {
//     expect(stripeSubs.data.length).to.equal(2, "should have 2 subscriptions");
//   } else {
//     expect(stripeSubs.data.length).to.equal(
//       1,
//       "should only have 1 subscription"
//     );
//   }
// };

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
		product.group = prefix;
	}

	return products;
};

export const replaceItems = ({
	featureId,
	interval,
	newItem,
	items,
}: {
	featureId?: string;
	interval?: BillingInterval;
	newItem: ProductItem;
	items: ProductItem[];
}) => {
	const newItems = structuredClone(items);

	let index;
	if (featureId) {
		index = newItems.findIndex((item) => item.feature_id === featureId);
	}

	if (interval) {
		index = newItems.findIndex(
			(item) => item.interval === (interval as any) && nullish(item.feature_id),
		);
	}

	if (index === -1) {
		throw new Error("Item not found");
	}

	newItems[index!] = newItem;

	return newItems;
};
