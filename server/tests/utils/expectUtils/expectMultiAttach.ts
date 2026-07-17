import {
	type ApiCustomerV3,
	type ApiEntityV0,
	type AppEnv,
	type CusProductStatus,
	LegacyVersion,
	type Organization,
	type ProductV2,
} from "@autumn/shared";
import type { MultiAttachParamsV0Input } from "@shared/api/billing/attachV2/multiAttachParamsV0";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { expect } from "chai";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

type CustomerLike =
	| ApiCustomerV3
	| ApiEntityV0
	| { products?: any[]; invoices?: any[]; id?: string; features?: any };

import { timeout } from "@/utils/genUtils.js";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "../browserPool/completeInvoiceCheckoutV2";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "../browserPool/completeStripeCheckoutFormV2";

export const expectMultiAttachCorrect = async ({
	autumn,
	customerId,
	entityId,
	plans,
	results,
	discounts,
	expectedRewards,
	invoiceMode,
	db,
	org,
	env,
}: {
	autumn?: AutumnInt;
	customerId: string;
	entityId?: string;
	plans: MultiAttachParamsV0Input["plans"];
	results: {
		product: ProductV2;
		status: CusProductStatus;
		entityId?: string;
	}[];
	discounts?: MultiAttachParamsV0Input["discounts"];
	expectedRewards?: string[];
	invoiceMode?: MultiAttachParamsV0Input["invoice_mode"];
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
}) => {
	autumn = autumn || new AutumnInt({ version: LegacyVersion.v1_2 });

	const params: MultiAttachParamsV0Input = {
		customer_id: customerId,
		entity_id: entityId,
		plans,
		discounts,
		invoice_mode: invoiceMode,
	};

	const previewRes = await autumn.billing.previewMultiAttach(params);
	const attachRes = await autumn.billing.multiAttach(params);

	if (invoiceMode?.enabled && attachRes.invoice?.hosted_invoice_url) {
		await completeInvoiceCheckout({ url: attachRes.invoice.hosted_invoice_url });
		await timeout(5000);
	} else if (attachRes.payment_url) {
		await completeStripeCheckoutForm({ url: attachRes.payment_url });
		await timeout(5000);
	}

	await timeout(2500);

	for (const result of results) {
		let customer: CustomerLike;
		if (result.entityId) {
			customer = await autumn.entities.get(customerId, result.entityId);
		} else {
			customer = await autumn.customers.get(customerId);
		}

		expectProductAttached({
			customer: customer,
			product: result.product,
			status: result.status,
			entityId: result.entityId,
		});
	}

	const customer = await autumn.customers.get(customerId);
	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice.total).to.equal(previewRes.total);

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		rewards: expectedRewards,
	});

	return {
		previewRes,
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
	autumn = autumn || new AutumnInt({ version: LegacyVersion.v1_2 });
	for (const result of results) {
		let customer: CustomerLike;
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
