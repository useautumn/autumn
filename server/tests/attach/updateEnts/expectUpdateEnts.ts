import {
	type AppEnv,
	AttachBranch,
	type Organization,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import { expect } from "bun:test";
import type Stripe from "stripe";
import { expectSubToBeCorrect } from "tests/merged/mergeUtils/expectSubCorrect.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import {
	expectSubItemsCorrect,
	getSubsFromCusId,
} from "tests/utils/expectUtils/expectSubUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const runUpdateEntsTest = async ({
	autumn,
	stripeCli,
	customerId,
	customProduct,
	newVersion,
	db,
	org,
	env,
	customItems,
	usage,
}: {
	autumn: AutumnInt;
	stripeCli: Stripe;
	customerId: string;
	customProduct: ProductV2;
	newVersion?: number;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	customItems?: ProductItem[];
	usage?: {
		featureId: string;
		value: number;
	}[];
}) => {
	// 1. Get subs before

	const { subs: subsBefore } = await getSubsFromCusId({
		stripeCli,
		customerId,
		productId: customProduct.id,
		db,
		org,
		env,
	});

	const preview = await autumn.attachPreview({
		customer_id: customerId,
		product_id: customProduct.id,
		version: newVersion,
		is_custom: customItems ? true : undefined,
		items: customItems,
	});

	if (newVersion) {
		expect(preview.branch).toBe(AttachBranch.NewVersion);
	} else {
		expect(preview.branch).toBe(AttachBranch.SameCustomEnts);
		expect(preview.due_today).toBeUndefined();
	}

	await autumn.attach({
		customer_id: customerId,
		product_id: customProduct.id,
		version: newVersion,
		is_custom: customItems ? true : undefined,
		items: customItems,
	});

	// 1. Ensure no new invoices created
	const { subs: subsAfter, cusProduct } = await getSubsFromCusId({
		stripeCli,
		customerId,
		productId: customProduct.id,
		db,
		org,
		env,
	});

	const invoicesBefore = subsBefore.map((sub) => sub.latest_invoice);
	const invoicesAfter = subsAfter.map((sub) => sub.latest_invoice);
	const subIdsBefore = subsBefore.map((sub) => sub.id);
	const subIdsAfter = subsAfter.map((sub) => sub.id);

	// let periodEndsBefore = subsBefore.map((sub) => sub.current_period_end);
	// let periodEndsAfter = subsAfter.map((sub) => sub.current_period_end);

	expect(invoicesAfter).toEqual(invoicesBefore);
	expect(subIdsAfter).toEqual(subIdsBefore);
	// expect(periodEndsAfter).toEqual(periodEndsBefore);

	if (customItems) {
		expect(cusProduct.is_custom).toBe(true);
	}

	const customer = await autumn.customers.get(customerId);
	expectFeaturesCorrect({
		customer,
		product: customProduct,
		usage,
	});

	// 2. Expect product attached
	await expectSubItemsCorrect({
		stripeCli,
		customerId,
		product: customProduct,
		db,
		org,
		env,
	});

	await expectSubToBeCorrect({
		customerId,
		db,
		org,
		env,
	});
};

export default runUpdateEntsTest;
