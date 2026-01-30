import { expect } from "bun:test";
import type { Organization, ProductV2 } from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect.js";
import { expectResetAtCorrect } from "@tests/utils/expectUtils/expectAttach/expectResetAtCorrect.js";
import { expectTrialEndsAtCorrect } from "@tests/utils/expectUtils/expectAttach/expectTrialEndsAt.js";
import { expectFeaturesCorrect } from "@tests/utils/expectUtils/expectFeaturesCorrect.js";
import {
	expectSubItemsCorrect,
	getSubsFromCusId,
} from "@tests/utils/expectUtils/expectSubUtils.js";
import type { AppEnv } from "autumn-js";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { isFreeProductV2 } from "@/internal/products/productUtils/classifyProduct.js";
import { timeout } from "@/utils/genUtils.js";

export const expectSubsSame = ({
	subsBefore,
	subsAfter,
}: {
	subsBefore: Stripe.Subscription[];
	subsAfter: Stripe.Subscription[];
}) => {
	// let invoicesBefore = subsBefore.map((sub) => sub.latest_invoice);
	// let invoicesAfter = subsAfter.map((sub) => sub.latest_invoice);
	const subIdsBefore = subsBefore.map((sub) => sub.id);
	const subIdsAfter = subsAfter.map((sub) => sub.id);
	const periodsBefore = subsBefore.map((sub) => subToPeriodStartEnd({ sub }));
	const periodsAfter = subsAfter.map((sub) => subToPeriodStartEnd({ sub }));

	// expect(invoicesAfter).toEqual(invoicesBefore);
	expect(subIdsAfter).toEqual(subIdsBefore);
	expect(periodsBefore).toEqual(periodsAfter);
};

export const runMigrationTest = async ({
	autumn,
	stripeCli,
	customerId,
	fromProduct,
	toProduct,
	db,
	org,
	env,
	usage,
	numInvoices = 1,
}: {
	autumn: AutumnInt;
	stripeCli: Stripe;
	customerId: string;
	fromProduct: ProductV2;
	toProduct: ProductV2;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	usage?: {
		featureId: string;
		value: number;
	}[];
	numInvoices?: number;
}) => {
	const { subs: subsBefore } = await getSubsFromCusId({
		stripeCli,
		customerId,
		productId: fromProduct.id,
		db,
		org,
		env,
	});

	const cusBefore = await autumn.customers.get(customerId);

	await autumn.migrate({
		from_product_id: fromProduct.id,
		to_product_id: toProduct.id,
		from_version: fromProduct.version,
		to_version: toProduct.version,
	});

	await timeout(10000);

	const { subs: subsAfter } = await getSubsFromCusId({
		stripeCli,
		customerId,
		productId: toProduct.id,
		db,
		org,
		env,
	});

	expectSubsSame({ subsBefore, subsAfter });

	const cusAfter = await autumn.customers.get(customerId);

	expectFeaturesCorrect({
		customer: cusAfter,
		product: toProduct,
		usage,
	});

	expectResetAtCorrect({ cusBefore, cusAfter });
	expectTrialEndsAtCorrect({ cusBefore, cusAfter });

	const { cusProduct } = await expectSubItemsCorrect({
		stripeCli,
		customerId,
		product: toProduct,
		db,
		org,
		env,
	});

	if (!isFreeProductV2({ product: toProduct })) {
		await expectSubToBeCorrect({
			db,
			customerId,
			org,
			env,
		});
	}

	// if (!isFreeProductV2({ product: toProduct })) {
	//   expect(cusAfter.invoices.length).to.equal(numInvoices);
	// }

	return {
		stripeSubs: subsAfter,
		cusProduct,
	};
};
