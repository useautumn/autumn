// curUnix = await advanceTestClock({
//   stripeCli,
//   testClockId,
//   advanceTo: addHours(
//     addMonths(curUnix, 1),
//     hoursToFinalizeInvoice,
//   ).getTime(),

import { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AppEnv, Organization, ProductV2 } from "@autumn/shared";
import Stripe from "stripe";
import { expectFeaturesCorrect } from "../expectFeaturesCorrect.js";
import { getExpectedInvoiceTotal } from "../expectInvoiceUtils.js";
import { expect } from "chai";

// });
export const expectInvoiceAfterUsage = async ({
	autumn,
	customerId,
	entityId,
	featureId,
	product,
	usage,
	stripeCli,
	db,
	org,
	env,
	numInvoices = 2,
	expectExpired = false,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId: string;
	featureId: string;
	product: ProductV2;
	usage: number;
	stripeCli: Stripe;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	numInvoices?: number;
	expectExpired?: boolean;
}) => {
	let entity = await autumn.entities.get(customerId, entityId);

	if (expectExpired) {
		let matchingProduct = entity.products.find((p: any) => p.id === product.id);
		expect(matchingProduct).to.not.exist;
	} else {
		expectFeaturesCorrect({
			customer: entity,
			product,
		});
	}

	const invoiceTotal = await getExpectedInvoiceTotal({
		org,
		env,
		customerId,
		productId: product.id,
		stripeCli,
		db,
		usage: [
			{
				featureId,
				value: usage,
			},
		],
		onlyIncludeMonthly: true,
		onlyIncludeUsage: true,
		expectExpired,
	});

	let invoices = entity.invoices;

	expect(invoices.length).to.equal(numInvoices);
	expect(invoices[0].total).to.equal(invoiceTotal);
};
