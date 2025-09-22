import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	APIVersion,
	AppEnv,
	AttachBranch,
	CreateEntity,
	CreateReward,
	CusProductStatus,
	FeatureOptions,
	Organization,
	ProductOptions,
	ProductV2,
} from "@autumn/shared";

import {
	getAttachTotal,
	getCurrentOptions,
} from "tests/utils/testAttachUtils/testAttachUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectInvoicesCorrect } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { notNullish, timeout, toSnakeCase } from "@/utils/genUtils.js";
import { expectSubItemsCorrect } from "tests/utils/expectUtils/expectSubUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

import { expect } from "chai";
import { completeCheckoutForm } from "../stripeUtils.js";
import { AttachParams, Customer } from "autumn-js";
import { isFreeProductV2 } from "@/internal/products/productUtils/classifyProduct.js";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
import { Decimal } from "decimal.js";
import { completeInvoiceCheckout } from "../stripeUtils/completeInvoiceCheckout.js";

export const expectMultiAttachCorrect = async ({
	autumn,
	customerId,
	entityId,
	products,
	results,
	rewards,
	expectedRewards,
	attachParams,
	db,
	org,
	env,
}: {
	autumn?: AutumnInt;
	customerId: string;
	entityId?: string;
	products: ProductOptions[];
	results: {
		product: ProductV2;
		quantity: number;
		status: CusProductStatus;
		entityId?: string;
	}[];
	rewards?: string[];
	expectedRewards?: string[];
	attachParams?: any;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
}) => {
	autumn = autumn || new AutumnInt({ version: APIVersion.v1_2 });
	const checkoutRes = await autumn.checkout({
		customer_id: customerId,
		products: products,
		entity_id: entityId,
		// @ts-ignore
		reward: rewards,
		...attachParams,
	});

	const attachRes = await autumn.attach({
		customer_id: customerId,
		products: products,
		entity_id: entityId,
		// @ts-ignore
		reward: rewards,
		...attachParams,
	});

	if (attachRes.checkout_url) {
		if (attachParams?.invoice) {
			await completeInvoiceCheckout({
				url: attachRes.checkout_url,
				isLocal: true,
			});
		}
		await completeCheckoutForm(attachRes.checkout_url);
		await timeout(5000);
	}

	for (const result of results) {
		let customer;
		if (result.entityId) {
			customer = await autumn.entities.get(customerId, result.entityId);
		} else {
			customer = await autumn.customers.get(customerId);
		}

		expectProductAttached({
			customer,
			product: result.product,
			status: result.status,
			entityId: result.entityId,
		});
	}

	const customer = await autumn.customers.get(customerId);
	const latestInvoice = customer.invoices[0];
	expect(latestInvoice.total).to.equal(checkoutRes.total);

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		rewards: expectedRewards,
	});

	return {
		checkoutRes,
	};
};

export const expectResultsCorrect = async ({
	autumn,
	customerId,
	results,
}: {
	autumn?: AutumnInt;
	customerId: string;
	results: {
		product: ProductV2;
		quantity: number;
		status: CusProductStatus;
		entityId?: string;
	}[];
}) => {
	autumn = autumn || new AutumnInt({ version: APIVersion.v1_2 });
	for (const result of results) {
		let customer;
		if (result.entityId) {
			customer = await autumn.entities.get(customerId, result.entityId);
		} else {
			customer = await autumn.customers.get(customerId);
		}

		expectProductAttached({
			customer,
			product: result.product,
			status: result.status,
			quantity: result.quantity,
		});
	}
};
