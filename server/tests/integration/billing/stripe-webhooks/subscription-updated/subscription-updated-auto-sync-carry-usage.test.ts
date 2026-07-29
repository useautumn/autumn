/**
 * TDD contract: back-synced plan changes (customer.subscription.updated /
 * customer.subscription.created auto-sync) carry consumed usage onto the
 * replacement plan using the same carry semantics as attach.
 *
 * Models the Resend back-sync scenarios (emails = consumable w/ overage price,
 * contacts = allocated w/ no price):
 *   1. 30k used on 50k plan  -> upgrade 100k  => 30k/100k   (balance 70k)
 *   2. 100k used on 50k plan -> upgrade 100k  => 100k/100k  (balance 0, overage offset)
 *   3. 200k used on 50k plan -> upgrade 100k  => 200k/100k  (balance -100k, follows attach)
 *   4. 100k used on 100k plan-> downgrade 50k => 100k/50k   (balance -50k, follows attach)
 *   5. allocated 25k used on 25k plan -> downgrade 5k => 25k/5k (balance -20k, no floor)
 *   6. org transition rule { enabled: false } -> consumables NOT carried on sync
 *   7. free (default) -> paid via sub.created auto-sync carries free-plan usage
 *
 * Pre-impl red: syncV2's carry skips pay-per-use entitlements entirely (1-4, 7
 * see fresh balances) and floors allocated carries at zero (5). 6 documents the
 * rule inheritance wiring for sync.
 * Post-impl green: sync builds an existing-usages carry config (org transition
 * rules inherited, default carry-all) through the shared attach machinery.
 */

import { test } from "bun:test";
import {
	createCustomBasePriceForProduct,
	createExternalStripeSubscription,
	expectStripeSubscriptionCreated,
	getFullProduct,
	getFullProductFromMap,
	setupSharedStripeFamilies,
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
import { AutumnInt } from "@/external/autumn/autumnCli.js";

/** Base(consumable messages) + one variant, external sub on the base. */
const setupConsumableFamilyOnBase = async ({
	customerId,
	baseId,
	baseIncluded,
	variantId,
	variantIncluded,
	variantAmount,
}: {
	customerId: string;
	baseId: string;
	baseIncluded: number;
	variantId: string;
	variantIncluded: number;
	variantAmount: number;
}) => {
	const {
		autumnV1,
		ctx: testCtx,
		fullProducts,
	} = await setupSharedStripeFamilies({
		customerId,
		families: [
			{
				baseId,
				group: `grp-${baseId}`,
				baseAmount: 20,
				featureId: TestFeature.Messages,
				baseIncluded,
				variants: [
					{ id: variantId, amount: variantAmount, included: variantIncluded },
				],
			},
		],
	});
	const baseFull = getFullProductFromMap({ fullProducts, productId: baseId });
	const variantFull = getFullProductFromMap({
		fullProducts,
		productId: variantId,
	});

	const basePrice = await createCustomBasePriceForProduct({
		ctx: testCtx,
		fullProduct: baseFull,
		amount: 20,
	});
	const subscription = await createExternalStripeSubscription({
		ctx: testCtx,
		customerId,
		items: [{ price: basePrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription });

	await waitForCustomerProducts({
		label: "initial-sync",
		autumnV1,
		customerId,
		active: [baseId],
		notPresent: [variantId],
	});

	return { autumnV1, ctx: testCtx, baseFull, variantFull, subscription };
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. Upgrade carries usage: 30k/50k -> 100k plan => balance 70k
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// 2. Overage offset: 100k/50k (50k overage) -> 100k plan => balance 0
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// 3. Usage still above new allowance: 200k/50k -> 100k plan => balance -100k
// ═══════════════════════════════════════════════════════════════════════════
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

	const { autumnV1 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [planA, planB], prefix: "" }),
		],
		actions: [],
	});

	const planAFull = await getFullProduct({ ctx, productId: planA.id });
	const planBFull = await getFullProduct({ ctx, productId: planB.id });

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

// ═══════════════════════════════════════════════════════════════════════════
// 6. Org transition rule { enabled: false }: consumables NOT carried on sync
// ═══════════════════════════════════════════════════════════════════════════
test(`${chalk.yellowBright("sub.updated auto-sync carry 6: org rule enabled=false skips consumable carry")}`, async () => {
	const customerId = "sync-carry-rule-off";
	const baseId = "sync-carry-rule-base";
	const variantId = "sync-carry-rule-100k";

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

	const orgClient = new AutumnInt({ secretKey: testCtx.orgSecretKey });
	try {
		await trackCustomerUsage({
			autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			value: 30_000,
		});

		await orgClient.patch("/organization/transition_rules", {
			carry_over_usages: { enabled: false },
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
			balance: 100_000,
			usage: 0,
		});
	} finally {
		await orgClient
			.patch("/organization/transition_rules", { carry_over_usages: null })
			.catch(() => undefined);
	}
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Free (default) -> paid via sub.created auto-sync carries free-plan usage
// ═══════════════════════════════════════════════════════════════════════════
test(`${chalk.yellowBright("sub.created auto-sync carry 7: default free usage carries onto synced paid plan")}`, async () => {
	const customerId = "sync-carry-free-to-paid";
	const group = "grp-sync-carry-free";

	const free = products.base({
		id: "sync-carry-free",
		group,
		items: [items.monthlyMessages({ includedUsage: 3_000 })],
	});
	const paid = products.base({
		id: "sync-carry-paid",
		group,
		items: [
			items.monthlyPrice({ price: 20 }),
			items.consumableMessages({ includedUsage: 50_000, price: 0.9 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, paid], prefix: "" }),
		],
		actions: [],
	});

	// s.attach would re-prefix the raw (prefix: "") product id, so attach directly.
	await autumnV1.attach({ customer_id: customerId, product_id: free.id });

	await trackCustomerUsage({
		autumnV1,
		customerId,
		featureId: TestFeature.Messages,
		value: 2_000,
	});

	const paidFull = await getFullProduct({ ctx, productId: paid.id });
	const paidPrice = await createCustomBasePriceForProduct({
		ctx,
		fullProduct: paidFull,
		amount: 20,
	});
	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: paidPrice.id }],
	});
	expectStripeSubscriptionCreated({ subscription });

	const customer = await waitForCustomerProducts({
		label: "after-sub-created",
		autumnV1,
		customerId,
		active: [paid.id],
		notPresent: [free.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 50_000,
		balance: 48_000,
		usage: 2_000,
	});
});
