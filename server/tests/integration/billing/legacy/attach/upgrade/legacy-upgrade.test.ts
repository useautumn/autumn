import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	isFixedPrice,
	ProductItemInterval,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx, {
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addYears } from "date-fns";
import { createStripeFixedPrice } from "@/external/stripe/createStripePrice/createStripeFixedPrice";
import { attachPmToCus } from "@/external/stripe/stripeCusUtils";
import { ProductService } from "@/internal/products/ProductService";
import { checkStripeProductExists } from "@/internal/products/productUtils";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";
import { getCusSub } from "@/utils/scriptUtils/testUtils/cusTestUtils";
import { toMilliseconds } from "@/utils/timeUtils";

const stampZeroFixedStripePrices = async ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}) => {
	let fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	if (!fullProduct.processor?.id) {
		await checkStripeProductExists({
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			product: fullProduct,
			logger: ctx.logger,
		});
		fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: productId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
	}
	for (const price of fullProduct.prices) {
		if (!isFixedPrice(price)) continue;
		if ((price.config.amount ?? 0) > 0) continue;
		if (price.config.stripe_price_id) continue;
		await createStripeFixedPrice({
			db: ctx.db,
			stripeCli: ctx.stripeCli,
			price,
			product: fullProduct,
			org: ctx.org,
		});
	}
};

test.concurrent(`${chalk.yellowBright("legacy-upgrade 1: upgrade with payment method validation")}`, async () => {
	const customerId = "legacy-upgrade-1";

	const proProduct = constructProduct({
		id: "pro",
		type: "pro",
		items: [
			constructFeatureItem({
				featureId: TestFeature.Dashboard,
				isBoolean: true,
			}),
			constructFeatureItem({
				featureId: TestFeature.Messages,
				includedUsage: 10,
				interval: ProductItemInterval.Month,
			}),
			constructFeatureItem({
				featureId: TestFeature.Admin,
				unlimited: true,
			}),
		],
	});

	const premiumProduct = constructProduct({
		id: "premium",
		type: "premium",

		items: [
			constructFeatureItem({
				featureId: TestFeature.Messages,
				includedUsage: 100,
				interval: ProductItemInterval.Month,
			}),
		],
	});

	const { autumnV1, customer } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proProduct, premiumProduct] }),
		],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: proProduct.id,
	});

	const customerAfterPro =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPro,
		active: [proProduct.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPro,
		featureId: TestFeature.Messages,
		includedUsage: 10,
		balance: 10,
		usage: 0,
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.attach({
				customer_id: customerId,
				product_id: premiumProduct.id,
				force_checkout: true,
			});
		},
	});

	await attachPmToCus({
		db: ctx.db,
		customer,
		org: ctx.org,
		env: ctx.env,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premiumProduct.id,
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremium,
		active: [premiumProduct.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2,
		latestTotal: 30,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-upgrade 2: upgrade monthly to annual mid-cycle")}`, async () => {
	const customerId = "legacy-upgrade-2";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [wordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, proAnnual] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ weeks: 2 }),
		],
	});

	const checkoutRes = await autumnV1.checkout({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	expect(checkoutRes.next_cycle).toBeDefined();
	expect(checkoutRes.next_cycle?.starts_at).toBeCloseTo(
		addYears(new Date(), 1).getTime(),
		-Math.log10(toMilliseconds.days(1)),
	);

	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	const sub = await getCusSub({
		ctx,
		customerId,
		productId: proAnnual.id,
	});

	const subItem = sub!.items.data[0];
	expect(subItem.current_period_end * 1000).toBeCloseTo(
		checkoutRes.next_cycle?.starts_at ?? 0,
		-Math.log10(toMilliseconds.days(1)),
	);
});

test.concurrent(`${chalk.yellowBright("legacy-upgrade 3: upgrade monthly to annual after 1.5 cycles")}`, async () => {
	const customerId = "legacy-upgrade-3";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [wordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, proAnnual] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ months: 1, weeks: 2 }),
		],
	});

	const checkoutRes = await autumnV1.checkout({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	expect(checkoutRes.next_cycle).toBeDefined();
	expect(checkoutRes.next_cycle?.starts_at).toBeCloseTo(
		addYears(new Date(), 1).getTime(),
		-Math.log10(toMilliseconds.days(1)),
	);

	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	const sub = await getCusSub({
		ctx,
		customerId,
		productId: proAnnual.id,
	});

	const subItem = sub!.items.data[0];
	expect(subItem.current_period_end * 1000).toBeCloseTo(
		checkoutRes.next_cycle?.starts_at ?? 0,
		-Math.log10(toMilliseconds.days(1)),
	);
});

test.concurrent(`${chalk.yellowBright("legacy-upgrade 4: free (no prices) to $0/month with usage-based prices")}`, async () => {
	const customerId = "legacy-upgrade-free-to-zero-usage";

	const zeroMonthlyPrice = items.monthlyPrice({ price: 0 });

	const free = products.base({
		id: "free",
		items: [
			zeroMonthlyPrice,
			items.consumableMessages({ includedUsage: 0, price: 0.5 }),
		],
	});

	const usagePlan = products.base({
		id: "usage-plan",
		items: [
			zeroMonthlyPrice,
			items.consumableMessages({ includedUsage: 0, price: 0.1 }),
		],
	});

	const { autumnV1, ctx: scenarioCtx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, usagePlan] }),
		],
		actions: [],
	});

	await stampZeroFixedStripePrices({ ctx: scenarioCtx, productId: free.id });
	await stampZeroFixedStripePrices({
		ctx: scenarioCtx,
		productId: usagePlan.id,
	});
	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [free.id],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: usagePlan.id,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfter,
		active: [usagePlan.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 0,
		balance: 0,
		usage: 0,
	});
});
