import { test } from "bun:test";
import {
	trackCustomerUsage,
	updateBaseSubscriptionItemToVariant,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { setupConsumableFamilyOnBase } from "./utils/autoSyncCarryUsage";

test(`${chalk.yellowBright("sub.updated auto-sync carry 1: upgrade carries consumable usage")}`, async () => {
	const customerId = "sync-carry-upgrade-basic";
	const baseId = "sync-carry-up-base";
	const variantId = "sync-carry-up-100k";

	const {
		autumnV1,
		ctx: testCtx,
		baseFull,
		variantFull,
		subscription,
	} = await setupConsumableFamilyOnBase({
		customerId,
		baseId,
		baseIncluded: 50_000,
		variantId,
		variantIncluded: 100_000,
		variantAmount: 35,
	});

	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		value: 30_000,
	});

	await updateBaseSubscriptionItemToVariant({
		ctx: testCtx,
		subscription,
		fromFullProduct: baseFull,
		toFullProduct: variantFull,
		toAmount: 35,
	});

	const customer = await waitForCustomerProducts({
		label: "after-upgrade",
		autumnV1,
		customerId,
		active: [variantId],
		notPresent: [baseId],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100_000,
		balance: 70_000,
		usage: 30_000,
	});
});

test(`${chalk.yellowBright("sub.updated auto-sync carry 2: upgrade offsets existing overage")}`, async () => {
	const customerId = "sync-carry-overage-offset";
	const baseId = "sync-carry-off-base";
	const variantId = "sync-carry-off-100k";

	const {
		autumnV1,
		ctx: testCtx,
		baseFull,
		variantFull,
		subscription,
	} = await setupConsumableFamilyOnBase({
		customerId,
		baseId,
		baseIncluded: 50_000,
		variantId,
		variantIncluded: 100_000,
		variantAmount: 35,
	});

	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		value: 100_000,
	});

	await updateBaseSubscriptionItemToVariant({
		ctx: testCtx,
		subscription,
		fromFullProduct: baseFull,
		toFullProduct: variantFull,
		toAmount: 35,
	});

	const customer = await waitForCustomerProducts({
		label: "after-upgrade",
		autumnV1,
		customerId,
		active: [variantId],
		notPresent: [baseId],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100_000,
		balance: 0,
		usage: 100_000,
	});
});

test(`${chalk.yellowBright("sub.updated auto-sync carry 3: remaining overage persists past upgrade")}`, async () => {
	const customerId = "sync-carry-overage-beyond";
	const baseId = "sync-carry-bey-base";
	const variantId = "sync-carry-bey-100k";

	const {
		autumnV1,
		ctx: testCtx,
		baseFull,
		variantFull,
		subscription,
	} = await setupConsumableFamilyOnBase({
		customerId,
		baseId,
		baseIncluded: 50_000,
		variantId,
		variantIncluded: 100_000,
		variantAmount: 35,
	});

	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		value: 200_000,
	});

	await updateBaseSubscriptionItemToVariant({
		ctx: testCtx,
		subscription,
		fromFullProduct: baseFull,
		toFullProduct: variantFull,
		toAmount: 35,
	});

	const customer = await waitForCustomerProducts({
		label: "after-upgrade",
		autumnV1,
		customerId,
		active: [variantId],
		notPresent: [baseId],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100_000,
		balance: -100_000,
		usage: 200_000,
	});
});
