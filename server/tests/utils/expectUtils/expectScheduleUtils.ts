import {
	type AppEnv,
	AttachBranch,
	type AttachPreview,
	CusProductStatus,
	cusProductToPrices,
	type FullCusProduct,
	type FullCustomer,
	type Organization,
	type ProductV2,
} from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect.js";
import { expect } from "chai";
import { addHours } from "date-fns";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { findStripePriceFromPrices } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { getStripeSchedules } from "@/external/stripe/stripeSubUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { isV4Usage } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { isFreeProductV2 } from "@/internal/products/productUtils/classifyProduct.js";
import { hoursToFinalizeInvoice } from "../constants.js";
import { advanceTestClock } from "../stripeUtils.js";
import {
	expectProductAttached,
	expectScheduledApiSub,
} from "./expectProductAttached.js";
import { expectSubItemsCorrect } from "./expectSubUtils.js";

export const expectNextCycleCorrect = async ({
	autumn,
	preview,
	stripeCli,
	customerId,
	testClockId,
	product,
	db,
	org,
	env,
	advanceClock = true,
}: {
	autumn: AutumnInt;
	preview: AttachPreview;
	stripeCli: Stripe;
	customerId: string;
	testClockId: string;
	product: ProductV2;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	advanceClock?: boolean;
}) => {
	if (advanceClock) {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				preview!.due_next_cycle.due_at,
				hoursToFinalizeInvoice,
			).getTime(),
		});
	}

	const customer = await autumn.customers.get(customerId);

	expectProductAttached({
		customer,
		product,
	});

	await expectSubItemsCorrect({
		stripeCli,
		customerId,
		product,
		db,
		org,
		env,
	});
};

export const expectDowngradeCorrect = async ({
	customerId,
	curProduct,
	newProduct,
	autumn,
	stripeCli,
	db,
	org,
	env,
}: {
	customerId: string;
	curProduct: ProductV2;
	newProduct: ProductV2;
	autumn: AutumnInt;
	stripeCli: Stripe;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
}) => {
	const preview = await autumn.attachPreview({
		customer_id: customerId,
		product_id: newProduct.id,
	});

	await autumn.attach({
		customer_id: customerId,
		product_id: newProduct.id,
	});

	const customer = await autumn.customers.get(customerId);

	const productCount = customer.products.reduce((acc: number, product: any) => {
		if (product.group === curProduct.group) {
			return acc + 1;
		} else return acc;
	}, 0);

	expect(
		productCount,
		"customer should only have 2 products (from this group)",
	).to.equal(2);

	expectProductAttached({
		customer,
		product: curProduct,
		isCanceled: true,
	});

	const newProductIsFree = isFreeProductV2({ product: newProduct });

	expectProductAttached({
		customer,
		product: newProduct,
		status: CusProductStatus.Scheduled,
	});

	await expectScheduledApiSub({
		customerId,
		productId: newProduct.id,
	});

	await expectSubToBeCorrect({
		db,
		customerId,
		org,
		env,
		shouldBeCanceled: newProductIsFree,
	});

	expect(preview.branch).to.equal(AttachBranch.Downgrade);

	return {
		preview,
	};
};

export const expectSubScheduleCorrect = async ({
	stripeCli,
	customerId,
	productId,
	db,
	org,
	env,
	fullCus,
}: {
	stripeCli: Stripe;
	customerId: string;
	productId: string;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	fullCus?: FullCustomer;
}) => {
	// 1. Check schedule
	if (!fullCus) {
		fullCus = await CusService.getFull({
			ctx: { db, org, env } as any,
			idOrInternalId: customerId,
		});
	}

	const cusProduct = fullCus.customer_products.find(
		(cp: FullCusProduct) => cp.product.id === productId,
	)!;

	const scheduleSets = await getStripeSchedules({
		stripeCli,
		scheduleIds: cusProduct?.scheduled_ids || [],
	});

	const stripePrices = scheduleSets.flatMap(
		(schedule) => schedule?.prices || [],
	);

	const autumnPrices = cusProductToPrices({ cusProduct });

	let missingUsageCount = 0;

	for (const autumnPrice of autumnPrices) {
		const stripePrice = findStripePriceFromPrices({
			stripePrices,
			autumnPrice,
		});

		if (isV4Usage({ price: autumnPrice!, cusProduct })) {
			missingUsageCount++;
		} else {
			expect(stripePrice).to.exist;
		}
	}

	expect(
		stripePrices.length,
		"number of schedule items equivalent to number of autumn prices",
	).to.equal(autumnPrices.length - missingUsageCount);
};
