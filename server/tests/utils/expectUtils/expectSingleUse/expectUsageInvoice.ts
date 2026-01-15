// curUnix = await advanceTestClock({
//   stripeCli,
//   testClockId,
//   advanceTo: addHours(
//     addMonths(curUnix, 1),
//     hoursToFinalizeInvoice,
//   ).getTime(),

import type { AppEnv, Organization, ProductV2 } from "@autumn/shared";
import { expect } from "chai";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { expectFeaturesCorrect } from "../expectFeaturesCorrect.js";
import { getExpectedInvoiceTotal } from "../expectInvoiceUtils.js";

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
	const entity = await autumn.entities.get(customerId, entityId);

	if (expectExpired) {
		const matchingProduct = entity.products.find(
			(p: any) => p.id === product.id,
		);
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

	const invoices = entity.invoices;

	expect(invoices?.length).to.equal(numInvoices);
	expect(invoices?.[0].total).to.equal(invoiceTotal);
};
