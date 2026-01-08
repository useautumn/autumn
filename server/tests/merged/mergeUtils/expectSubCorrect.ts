import { expect } from "bun:test";
import {
	type AppEnv,
	CusProductStatus,
	cusProductToEnts,
	cusProductToPrices,
	cusProductToProduct,
	type FullCustomer,
	type Organization,
} from "@autumn/shared";
import { notNullish } from "@shared/utils/utils.js";
import { defaultApiVersion } from "@tests/constants.js";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { priceToStripeItem } from "@/external/stripe/priceToStripeItem/priceToStripeItem.js";
import { isStripeSubscriptionCanceled } from "@/external/stripe/stripeSubUtils.js";
import {
	cusProductInPhase,
	logPhaseItems,
	similarUnix,
} from "@/internal/customers/attach/mergeUtils/phaseUtils/phaseUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ACTIVE_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { getExistingUsageFromCusProducts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { getUniqueUpcomingSchedulePairs } from "@/internal/customers/cusProducts/cusProductUtils/getUpcomingSchedules.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import {
	formatPrice,
	getPriceEntitlement,
	getPriceOptions,
} from "@/internal/products/prices/priceUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { formatUnixToDateTime, nullish } from "@/utils/genUtils.js";
import type { TestContext } from "../../utils/testInitUtils/createTestContext.js";
import { cusProductToSubIds } from "../mergeUtils.test.js";

const compareActualItems = async ({
	actualItems,
	expectedItems,
	type,
	fullCus,
	db,
	phaseStartsAt,
}: {
	actualItems: any[];
	expectedItems: any[];
	type: "sub" | "schedule";
	fullCus: FullCustomer;
	phaseStartsAt?: number;
	db: DrizzleCli;
}) => {
	for (const expectedItem of expectedItems) {
		const actualItem = actualItems.find(
			(item: any) => item.price === (expectedItem as any).price,
		);

		if (!actualItem) {
			// Search for price by stripe id
			const price = await PriceService.getByStripeId({
				db,
				stripePriceId: expectedItem.price,
			});
			console.log(`(${type}) Missing item:`, expectedItem);
			// if (price) {
			//   console.log(`Autumn price:`, `${price.id} - ${formatPrice({ price })}`);
			// }

			// Actual items
			console.log(`(${type}) Actual items (${actualItems.length}):`);
			await logPhaseItems({
				db,
				items: actualItems,
			});

			console.log(`(${type}) Expected items (${expectedItems.length}):`);
			await logPhaseItems({
				db,
				items: expectedItems,
			});
		}

		expect(actualItem).toBeDefined();

		// Treat 0 and undefined as equivalent for quantity
		const actualQty = actualItem?.quantity ?? 0;
		const expectedQty = (expectedItem as any).quantity ?? 0;

		if (actualQty !== expectedQty) {
			if (phaseStartsAt) {
				console.log(`Phase starts at: ${formatUnixToDateTime(phaseStartsAt)}`);
			}

			console.log("Actual items:");
			await logPhaseItems({
				db,
				items: actualItems,
			});

			console.log("Expected items:");
			await logPhaseItems({
				db,
				items: expectedItems,
			});

			console.log(`Item quantity mismatch: ${actualQty} !== ${expectedQty}`);

			const price = await PriceService.getByStripeId({
				db,
				stripePriceId: expectedItem.price,
			});
			if (price) {
				console.log(
					`Autumn price:`,
					`${price?.product.name} - ${formatPrice({ price })}`,
				);
			}

			console.log("--------------------------------");
		}

		expect(actualQty).toBe(expectedQty);
	}

	expect(actualItems.length).toBe(expectedItems.length);
};

export const expectSubToBeCorrect = async ({
	db,
	customerId,
	org,
	env,

	entityId,
	shouldBeCanceled,
	shouldBeTrialing = false,
	flags,
	subId,
	rewards,
}: {
	db: DrizzleCli;
	customerId: string;
	org: Organization;
	env: AppEnv;

	entityId?: string;
	shouldBeCanceled?: boolean;
	shouldBeTrialing?: boolean;
	flags?: {
		checkNotTrialing?: boolean;
	};
	subId?: string;
	rewards?: string[];
}) => {
	const stripeCli = createStripeCli({ org, env });
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		withEntities: true,
	});

	// 1. Only 1 sub ID available
	let cusProducts = fullCus.customer_products;

	if (!subId) {
		const subIds = cusProductToSubIds({ cusProducts });
		subId = subIds[0];
		expect(subIds.length).toBe(1);
	} else {
		cusProducts = cusProducts.filter((cp) =>
			cp.subscription_ids?.includes(subId!),
		);
	}

	// Get the items that should be in the sub
	const supposedSubItems = [];

	const scheduleUnixes = getUniqueUpcomingSchedulePairs({
		cusProducts,
		now: Date.now(),
	});

	const supposedPhases: any[] = scheduleUnixes.map((unix) => {
		return {
			start_date: unix, // milliseconds
			items: [],
		};
	});

	// console.log(`\n\nChecking sub correct`);
	const printCusProduct = false;
	if (printCusProduct) {
		console.log(`\n\nChecking sub correct`);
	}

	for (const cusProduct of cusProducts) {
		const prices = cusProductToPrices({ cusProduct });
		const ents = cusProductToEnts({ cusProduct });
		const product = cusProductToProduct({ cusProduct });

		// Add to schedules
		const scheduleIndexes: number[] = [];
		const apiVersion = cusProduct.api_semver || defaultApiVersion;

		if (isFreeProduct(product.prices)) {
			expect(cusProduct.subscription_ids).toEqual([]);
			continue;
		}

		if (printCusProduct) {
			console.log(
				`Cus product: ${cusProduct.product.name}, Status: ${cusProduct.status}, Entity ID: ${cusProduct.entity_id}`,
			);
			console.log(`Starts at: ${formatUnixToDateTime(cusProduct.starts_at)}`);
		}

		scheduleUnixes.forEach((unix, index) => {
			if (
				cusProduct.status === CusProductStatus.Scheduled &&
				cusProductInPhase({ phaseStartMillis: unix, cusProduct })
			) {
				scheduleIndexes.push(index);
				return;
			}

			if (cusProduct.status === CusProductStatus.Scheduled) return;

			if (cusProduct.product.is_add_on) {
				// 1. If it's canceled
				if (cusProduct.canceled && (cusProduct.ended_at || 0) > unix) {
					scheduleIndexes.push(index);
					return;
				} else if (!cusProduct.canceled) {
					scheduleIndexes.push(index);
					return;
				}

				return;
			}

			// 2. If main product, check that schedule is AFTER this phase
			const curScheduledProduct = cusProducts.find(
				(cp) =>
					cp.product.group === product.group &&
					cp.status === CusProductStatus.Scheduled &&
					(cp.internal_entity_id
						? cp.internal_entity_id === cusProduct.internal_entity_id
						: nullish(cp.internal_entity_id)),
			);

			if (!curScheduledProduct) {
				scheduleIndexes.push(index);
				return;
			}

			// If scheduled product NOT in phase, add main product to schedule
			if (
				!cusProductInPhase({
					phaseStartMillis: unix,
					cusProduct: curScheduledProduct,
				})
			) {
				scheduleIndexes.push(index);
			}
		});

		if (printCusProduct) {
			console.log(`Schedule indexes:`, scheduleIndexes);
			console.log("--------------------------------");
		}

		// const hasScheduledProduct =
		cusProduct.status !== CusProductStatus.Scheduled &&
			!cusProduct.product.is_add_on &&
			cusProducts.some(
				(cp) =>
					cp.product.group === product.group &&
					ACTIVE_STATUSES.includes(cp.status),
			);

		const addToSub = cusProduct.status !== CusProductStatus.Scheduled;

		for (const price of prices) {
			const relatedEnt = getPriceEntitlement(price, ents);
			const options = getPriceOptions(price, cusProduct.options);
			const existingUsage = getExistingUsageFromCusProducts({
				entitlement: relatedEnt,
				cusProducts,
				entities: fullCus.entities,
				carryExistingUsages: true,
				internalEntityId: cusProduct.internal_entity_id || undefined,
			});

			const res = priceToStripeItem({
				price,
				relatedEnt,
				product,
				org,
				options,
				existingUsage,
				withEntity: !!cusProduct.internal_entity_id,
				isCheckout: false,
				apiVersion,
				productOptions: cusProduct.quantity
					? {
							product_id: product.id,
							quantity: cusProduct.quantity,
						}
					: undefined,
			});

			if (res?.lineItem && nullish(res.lineItem.quantity)) {
				res.lineItem.quantity = 0;
			}

			// console.log("API VERSION:", apiVersion);
			// console.log("LINE ITEM:", res?.lineItem);
			if (options?.upcoming_quantity && res?.lineItem) {
				res.lineItem.quantity = options.upcoming_quantity;
			}

			const lineItem: any = res?.lineItem;
			if (lineItem && res?.lineItem) {
				if (addToSub) {
					const existingIndex = supposedSubItems.findIndex(
						(si: any) => si.price === lineItem.price,
					);

					if (existingIndex !== -1) {
						supposedSubItems[existingIndex].quantity += lineItem.quantity;
					} else {
						supposedSubItems.push({
							...res.lineItem,
							priceStr: `${product.id}-${formatPrice({ price })}`,
						});
					}
				}

				for (const scheduleIndex of scheduleIndexes) {
					const phase = supposedPhases[scheduleIndex];
					const existingIndex = phase.items.findIndex(
						(item: any) => item.price === lineItem.price,
					);

					if (existingIndex !== -1) {
						phase.items[existingIndex].quantity += lineItem.quantity!;
					} else {
						phase.items.push({
							price: lineItem.price,
							quantity: lineItem.quantity!,
						});
					}
				}
			}
		}
	}

	const sub = await stripeCli.subscriptions.retrieve(subId, {
		expand: ["discounts.coupon"],
	});

	const actualItems = sub.items.data.map((item: any) => ({
		price: item.price.id,
		quantity: item.quantity || 0,
	}));

	const subCouponIds = sub.discounts?.map(
		(discount: any) => discount.coupon.id,
	);
	if (rewards) {
		for (const reward of rewards) {
			const corresponding = subCouponIds.find(
				(subCouponId: any) => subCouponId === reward,
			);
			expect(corresponding).toBeDefined();
		}
		expect(subCouponIds.length).toBe(rewards.length);
	}

	await compareActualItems({
		actualItems,
		expectedItems: supposedSubItems,
		type: "sub",
		fullCus,
		db,
	});

	if (shouldBeTrialing) {
		expect(sub.status).toBe("trialing");
	}

	if (flags?.checkNotTrialing) {
		expect(sub.status).not.toBe("trialing");
	}

	// Should be canceled
	const cusSubShouldBeCanceled = cusProducts.every((cp) => {
		if (cp.subscription_ids?.includes(subId!)) {
			// 1. Get scheduled product
			const { curScheduledProduct } = getExistingCusProducts({
				cusProducts,
				product: cp.product,
				internalEntityId: cp.internal_entity_id,
			});

			if (curScheduledProduct) {
				const scheduledProduct = cusProductToProduct({
					cusProduct: curScheduledProduct,
				});
				if (!isFreeProduct(scheduledProduct.prices)) {
					return false;
				}
			}

			return cp.canceled;
		}

		return true;
	});

	// console.log("Sub should be canceled:", cusSubShouldBeCanceled);

	const finalShouldBeCanceled = notNullish(shouldBeCanceled)
		? shouldBeCanceled!
		: cusSubShouldBeCanceled;

	// console.log("Final should be canceled:", finalShouldBeCanceled);

	if (finalShouldBeCanceled) {
		expect(sub.schedule).toBeNull();
		// expect(sub.cancel_at).toBeDefined();
		expect(isStripeSubscriptionCanceled({ sub })).toBe(true);
		return;
	}

	const schedule =
		supposedPhases.length > 0
			? await stripeCli.subscriptionSchedules.retrieve(sub.schedule as string, {
					expand: ["phases.items.price"],
				})
			: null;

	// console.log("--------------------------------");
	// console.log("Supposed phases:");
	// await logPhases({
	//   phases: supposedPhases,
	//   db,
	// });

	// console.log("--------------------------------");
	// console.log("Actual phases:");

	// await logPhases({
	//   phases: (schedule?.phases as any) || [],
	//   db,
	// });

	for (let i = 0; i < supposedPhases.length; i++) {
		const supposedPhase = supposedPhases[i];

		if (supposedPhase.items.length === 0) continue;

		const actualPhase = schedule?.phases?.[i + 1];
		expect(schedule?.phases.length).toBeGreaterThan(i + 1);

		expect(
			similarUnix({
				unix1: supposedPhase.start_date,
				unix2: actualPhase!.start_date * 1000,
			}),
		).toBe(true);

		const actualItems =
			actualPhase?.items.map((item) => ({
				price: (item.price as Stripe.Price).id,
				quantity: item.quantity,
			})) || [];

		await compareActualItems({
			actualItems,
			expectedItems: supposedPhase.items,
			type: "schedule",
			fullCus,
			db,
			phaseStartsAt: supposedPhase.start_date,
		});
	}

	expect(sub.cancel_at).toBeNull();
	// if (shouldBeCanceled) {
	//   expect(sub.cancel_at).toBeDefined();
	// } else {
	// }
};

export const expectSubCount = async ({
	ctx,
	customerId,
	count,
}: {
	ctx: TestContext;
	customerId: string;
	count: number;
}) => {
	const stripeCli = ctx.stripeCli;
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	if (!customer?.processor?.id) {
		throw new Error(`Customer ${customerId} has no processor`);
	}

	const subs = await stripeCli.subscriptions.list({
		customer: customer?.processor?.id,
	});

	expect(subs.data.length).toBe(count);
};
