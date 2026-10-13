// Contract: back-synced plan changes (sub.updated / sub.created auto-sync) carry consumed usage onto
// the replacement plan with the same carry semantics as attach.

import { test } from "bun:test";
import {
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	ensureDistinctStripeProcessor,
	expectStripeSubscriptionCreated,
	getFullProduct,
	trackCustomerUsage,
	updateBaseSubscriptionItemToVariant,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	deleteLeftoverCarryPlans,
	setupConsumableFamilyOnBase,
} from "./utils/autoSyncCarryUsage";

// ═══════════════════════════════════════════════════════════════════════════
// 4. Downgrade: 100k/100k -> 50k plan => balance -50k (follows attach)
// ═══════════════════════════════════════════════════════════════════════════
test(`${chalk.yellowBright("sub.updated auto-sync carry 4: downgrade carries usage into overage")}`, async () => {
	const customerId = "sync-carry-downgrade";
	const baseId = "sync-carry-down-base";
	const variantId = "sync-carry-down-50k";

	const {
		autumnV1,
		ctx: testCtx,
		baseFull,
		variantFull,
		subscription,
	} = await setupConsumableFamilyOnBase({
		customerId,
		baseId,
		baseIncluded: 100_000,
		variantId,
		variantIncluded: 50_000,
		variantAmount: 15,
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
		toAmount: 15,
	});

	const customer = await waitForCustomerProducts({
		label: "after-downgrade",
		autumnV1,
		customerId,
		active: [variantId],
		notPresent: [baseId],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 50_000,
		balance: -50_000,
		usage: 100_000,
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Allocated downgrade (marketing contacts): 25k/25k -> 5k => balance -20k
// ═══════════════════════════════════════════════════════════════════════════
test(`${chalk.yellowBright("sub.updated auto-sync carry 5: allocated usage never changes, balance goes negative")}`, async () => {
	const customerId = "sync-carry-allocated";
	const group = "grp-sync-carry-allocated";

	const planA = products.base({
		id: "sync-carry-mkt-25k",
		group,
		items: [
			items.monthlyPrice({ price: 180 }),
			items.freeUsers({ includedUsage: 25_000 }),
		],
	});
	const planB = products.base({
		id: "sync-carry-mkt-5k",
		group,
		items: [
			items.monthlyPrice({ price: 80 }),
			items.freeUsers({ includedUsage: 5_000 }),
		],
	});

	await deleteLeftoverCarryPlans(["sync-carry-mkt-25k", "sync-carry-mkt-5k"]);

	const v1CustomerA = `${customerId}-v1-a`;
	const v1CustomerB = `${customerId}-v1-b`;
	const { autumnV1 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([
				{ id: v1CustomerA, paymentMethod: "success" },
				{ id: v1CustomerB, paymentMethod: "success" },
			]),
			s.products({ list: [planA, planB] }),
		],
		actions: [
			s.attach({ productId: planA.id, customerId: v1CustomerA }),
			s.attach({ productId: planB.id, customerId: v1CustomerB }),
		],
	});

	const planAFull = await getFullProduct({ ctx, productId: planA.id });
	const planBFull = await ensureDistinctStripeProcessor({
		ctx,
		fullProduct: await getFullProduct({ ctx, productId: planB.id }),
		otherProcessorId: planAFull.processor?.id,
	});

	const planAPrice = await createCustomBasePriceForProduct({
		ctx,
		fullProduct: planAFull,
		amount: 180,
	});
	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: planAPrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription });

	await waitForCustomerProducts({
		label: "initial-sync",
		autumnV1,
		customerId,
		active: [planA.id],
		notPresent: [planB.id],
	});

	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Users,
		value: 25_000,
	});

	await updateBaseSubscriptionItemToVariant({
		ctx,
		subscription,
		fromFullProduct: planAFull,
		toFullProduct: planBFull,
		toAmount: 80,
	});

	const customer = await waitForCustomerProducts({
		label: "after-downgrade",
		autumnV1,
		customerId,
		active: [planB.id],
		notPresent: [planA.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 5_000,
		balance: -20_000,
		usage: 25_000,
	});
});
