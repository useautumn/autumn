import {
	APIVersion,
	type AppEnv,
	type CusProductStatus,
	type Organization,
	type ProductOptions,
	type ProductV2,
} from "@autumn/shared";
import type { Customer } from "autumn-js";
import { expect } from "chai";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { completeInvoiceCheckout } from "../stripeUtils/completeInvoiceCheckout.js";
import { completeCheckoutForm } from "../stripeUtils.js";

export const expectMultiAttachCorrect = async ({
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
	customerId: string;
	entityId?: string;
	products: ProductOptions[];
	results: {
		product: ProductV2;
		quantity: number;
		status: CusProductStatus;
	}[];
	rewards?: string[];
	expectedRewards?: string[];
	// biome-ignore lint/suspicious/noExplicitAny: idk what the type is m8
	attachParams?: any;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
}) => {
	const autumn = new AutumnInt({ version: APIVersion.v1_2 });
	const checkoutRes = await autumn.checkout({
		customer_id: customerId,
		products: products,
		entity_id: entityId,
		reward: rewards,
		...attachParams,
	});

	const attachRes = await autumn.attach({
		customer_id: customerId,
		products: products,
		entity_id: entityId,
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
		let customer: Customer;
		customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: result.product,
			status: result.status,
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
	customerId,
	results,
}: {
	customerId: string;
	results: { product: ProductV2; quantity: number; status: CusProductStatus }[];
}) => {
	const autumn = new AutumnInt({ version: APIVersion.v1_2 });
	for (const result of results) {
		const customer: Customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: result.product,
			status: result.status,
		});
	}
};
