import { expect } from "bun:test";
import {
	type AppEnv,
	AttachBranch,
	type CreateEntityParams,
	CusProductStatus,
	type FeatureOptions,
	type Organization,
	type ProductV2,
} from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect.js";
import { expectFeaturesCorrect } from "@tests/utils/expectUtils/expectFeaturesCorrect.js";
import {
	expectInvoicesCorrect,
	expectProductAttached,
} from "@tests/utils/expectUtils/expectProductAttached.js";
import { getCurrentOptions } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import type { AttachParams, Customer } from "autumn-js";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { isFreeProductV2 } from "@/internal/products/productUtils/classifyProduct.js";
import { timeout, toSnakeCase } from "@/utils/genUtils.js";
import { completeCheckoutForm } from "../stripeUtils.js";

export const attachAndExpectCorrect = async ({
	autumn,
	customerId,
	entityId,
	product,
	otherProducts,
	options,
	stripeCli,
	db,
	org,
	env,
	usage,
	waitForInvoice = 0,
	isCanceled = false,
	skipFeatureCheck = false,
	skipSubCheck = false,
	numSubs,
	entities,
	shouldBeCanceled = false,
	checkNotTrialing = false,
	attachParams,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId?: string;
	product: ProductV2;
	otherProducts?: ProductV2[];
	options?: FeatureOptions[];
	stripeCli: Stripe;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	usage?: {
		featureId: string;
		value: number;
	}[];
	waitForInvoice?: number;
	isCanceled?: boolean;
	skipFeatureCheck?: boolean;
	skipSubCheck?: boolean;
	numSubs?: number;
	entities?: CreateEntityParams[];
	shouldBeCanceled?: boolean;
	checkNotTrialing?: boolean;
	attachParams?: AttachParams;
}) => {
	const preview = await autumn.attachPreview({
		customer_id: customerId,
		product_id: product.id,
		entity_id: entityId,
		...attachParams,
	});

	const checkoutRes = await autumn.checkout({
		customer_id: customerId,
		product_id: product.id,
		entity_id: entityId,
		options: toSnakeCase(options),
		...attachParams,
	});

	const logCheckoutRes = false;
	if (logCheckoutRes) {
		console.log("Checkout res:");
		for (const line of checkoutRes.lines) {
			console.log(line.description, line.amount);
		}
		console.log("Total: ", checkoutRes.total);
		console.log("--------------------------------");
	}

	const optionsCopy = getCurrentOptions({
		preview,
		options,
	});

	// const total = getAttachTotal({
	//   preview,
	//   options,
	// });

	const { checkout_url } = await autumn.attach({
		customer_id: customerId,
		product_id: product.id,
		entity_id: entityId,
		options: toSnakeCase(options),
		...attachParams,
	});

	if (checkout_url) {
		await completeCheckoutForm(checkout_url);
		await timeout(5000);
	}

	if (waitForInvoice) {
		await timeout(waitForInvoice);
	}

	let customer: Customer;
	if (entityId) {
		customer = await autumn.entities.get(customerId, entityId);
	} else {
		customer = await autumn.customers.get(customerId);
	}

	const productCount = customer.products.reduce((acc: number, p: any) => {
		if (
			product.group === p.group &&
			!p.is_add_on
			// && (entityId ? p.entity_id === entityId : true)
		) {
			return acc + 1;
		} else return acc;
	}, 0);

	const branch = preview.branch;

	if (branch === AttachBranch.Downgrade) {
		expect(
			productCount,
			`customer should only have 2 products (from this group: ${product.group})`,
		).toEqual(2);
	} else {
		expect(
			productCount,
			`customer should only have 1 product, instead got ${productCount}`,
		).toEqual(1);
	}

	expectProductAttached({
		customer,
		product,
		entityId,
		status:
			preview.branch === AttachBranch.Downgrade
				? CusProductStatus.Scheduled
				: undefined,
	});

	const skipInvoiceCheck =
		(preview.branch === AttachBranch.UpdatePrepaidQuantity &&
			checkoutRes.total === 0) ||
		preview.branch === AttachBranch.Downgrade;

	const freeProduct = isFreeProductV2({ product });
	if (!skipInvoiceCheck && !freeProduct) {
		expectInvoicesCorrect({
			customer,
			first: {
				productId: product.id,
				total: new Decimal(checkoutRes.total).toDecimalPlaces(2).toNumber(),
			},
		});
	}

	if (!skipFeatureCheck && branch !== AttachBranch.Downgrade) {
		expectFeaturesCorrect({
			customer,
			product,
			usage,
			options: optionsCopy,

			otherProducts,
			entities,
		});
	}

	if (branch === AttachBranch.OneOff) {
		return;
	}

	if (skipSubCheck) return;

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		shouldBeCanceled,
		flags: {
			checkNotTrialing,
		},
		entityId,
	});

	// await expectSubItemsCorrect({
	//   stripeCli,
	//   customerId,
	//   product,
	//   db,
	//   org,
	//   env,
	//   isCanceled,
	//   entityId,
	// });

	// let cus = await autumn.customers.get(customerId);
	// const stripeSubs = await stripeCli.subscriptions.list({
	//   customer: cus.stripe_id!,
	// });

	// if (numSubs) {
	//   expect(stripeSubs.data.length).to.equal(
	//     numSubs,
	//     `should have ${numSubs} subscriptions`
	//   );
	// } else {
	//   expect(stripeSubs.data.length).to.equal(
	//     1,
	//     "should only have 1 subscription"
	//   );
	// }
};

export const expectAttachCorrect = async ({
	customer,
	product,
	entityId,
	otherProducts,
}: {
	customer: Customer;
	product: ProductV2;
	entityId?: string;
	otherProducts?: ProductV2[];
}) => {
	expectProductAttached({
		customer,
		product,
		entityId,
	});

	expectFeaturesCorrect({
		customer,
		product,
		otherProducts,
	});
};
