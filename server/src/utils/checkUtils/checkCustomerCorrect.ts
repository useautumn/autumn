import { DrizzleCli } from "@/db/initDrizzle.js";
import {
	AppEnv,
	CusProductStatus,
	FullCustomer,
	Organization,
} from "@autumn/shared";

import Stripe from "stripe";
import { cusProductToSubIds } from "tests/merged/mergeUtils.test.js";
import { expect } from "bun:test";
import { getUniqueUpcomingSchedulePairs } from "@/internal/customers/cusProducts/cusProductUtils/getUpcomingSchedules.js";
import { priceToStripeItem } from "@/external/stripe/priceToStripeItem/priceToStripeItem.js";
import { subIsCanceled } from "@/external/stripe/stripeSubUtils.js";
import {
	cusProductInPhase,
	logPhaseItems,
	similarUnix,
} from "@/internal/customers/attach/mergeUtils/phaseUtils/phaseUtils.js";
import { getExistingUsageFromCusProducts } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { ACTIVE_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import {
	cusProductToPrices,
	cusProductToEnts,
	cusProductToProduct,
} from "@autumn/shared";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import {
	getPriceEntitlement,
	getPriceOptions,
	formatPrice,
} from "@/internal/products/prices/priceUtils.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import { defaultApiVersion } from "tests/constants.js";
import { formatUnixToDateTime, nullish } from "../genUtils.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import assert from "assert";
import {
	isFixedPrice,
	isOneOffPrice,
} from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";

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
		let actualItem = actualItems.find((item: any) => {
			if (item.price === (expectedItem as any).price) return true;

			// If only one item, allow matching by stripe prod id

			// If prices match, allow item.stripeProdId to match...

			// if (item.stripeProdId == (expectedItem as any).stripeProdId) return true;

			return false;
		});

		if (isFixedPrice({ price: expectedItem.autumnPrice }) && !actualItem) {
			actualItem = actualItems.find((item: any) => {
				return item.stripeProdId === expectedItem.stripeProdId;
			});
		}

		if (!actualItem) {
			// Search for price by stripe id
			const price = await PriceService.getByStripeId({
				db,
				stripePriceId: expectedItem.price,
			});

			const { autumnPrice, ...rest } = expectedItem;
			console.log(`(${type}) Missing item:`, rest);
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

		assert(!!actualItem, `actual item should exist`);

		// team manager...
		if (actualItem.price !== "price_1RGod7JvAPTxxzlIEbN6ZnW1") {
			if (actualItem?.quantity !== (expectedItem as any).quantity) {
				if (phaseStartsAt) {
					console.log(
						`Phase starts at: ${formatUnixToDateTime(phaseStartsAt)}`,
					);
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

				console.log(
					`Item quantity mismatch: ${actualItem?.quantity} !== ${expectedItem.quantity}`,
				);

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

			assert(
				actualItem?.quantity === (expectedItem as any).quantity,
				`actual items quantity should be equals to ${expectedItem.quantity}`,
			);
		}
	}

	if (actualItems.length !== expectedItems.length) {
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
	}

	assert(
		actualItems.length === expectedItems.length,
		`actual items length should be equals to expected items length`,
	);
};

// If all cus products are free, then should have no sub
const checkAllFreeProducts = async ({
	db,
	fullCus,
	subs,
}: {
	db: DrizzleCli;
	fullCus: FullCustomer;
	subs: Stripe.Subscription[];
}) => {
	const cusProducts = fullCus.customer_products;
	const allFreeOrOneOff = cusProducts.every((cp) => {
		const product = cusProductToProduct({ cusProduct: cp });
		return isFreeProduct(product.prices) || isOneOff(product.prices);
	});

	if (allFreeOrOneOff) {
		// Make sure no subs exist for this customer
		const sub = subs.find(
			(sub) =>
				sub.customer === fullCus.processor?.id &&
				(sub.status == "active" || sub.status == "past_due"),
		);

		if (fullCus.org_id == "6bWdIqEuRHBrReXbTb30l9beMFVZ3Ts3") return true;

		assert(
			!sub,
			`no sub should exist for this customer (${fullCus.email}, ${fullCus.id})`,
		);
		return true;
	}

	return false;
};

export const checkCusSubCorrect = async ({
	db,
	fullCus,
	subs,
	schedules,
	org,
	env,
}: {
	db: DrizzleCli;
	fullCus: FullCustomer;
	subs: Stripe.Subscription[];
	schedules: Stripe.SubscriptionSchedule[];
	org: Organization;
	env: AppEnv;
}) => {
	const allFree = await checkAllFreeProducts({
		db,
		fullCus,
		subs,
	});
	if (allFree) return;

	// 1. Only 1 sub ID available
	let cusProducts = fullCus.customer_products;
	const subIds = cusProductToSubIds({ cusProducts });

	const subId = subIds[0];

	assert(
		subIds.length === 1,
		`should only have 1 sub ID available, instead got ${subIds.join(", ")}`,
	);

	cusProducts = cusProducts.filter((cp) =>
		cp.subscription_ids?.includes(subId!),
	);

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
	let printCusProduct = false;
	if (printCusProduct) {
		console.log(`\n\nChecking sub correct`);
	}

	for (const cusProduct of cusProducts) {
		const prices = cusProductToPrices({ cusProduct });
		const ents = cusProductToEnts({ cusProduct });
		const product = cusProductToProduct({ cusProduct });

		// Add to schedules
		const scheduleIndexes: number[] = [];
		const apiVersion = cusProduct.api_version || defaultApiVersion;

		if (isFreeProduct(product.prices)) {
			assert(
				cusProduct.subscription_ids?.length === 0,
				"free product should have no subs",
			);
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
				return scheduleIndexes.push(index);
			}

			if (cusProduct.status === CusProductStatus.Scheduled) return;

			if (cusProduct.product.is_add_on) {
				// 1. If it's canceled
				if (cusProduct.canceled && (cusProduct.ended_at || 0) > unix) {
					return scheduleIndexes.push(index);
				} else if (!cusProduct.canceled) {
					return scheduleIndexes.push(index);
				}

				return;
			}

			// 2. If main product, check that schedule is AFTER this phase
			const curScheduledProduct = cusProducts.find(
				(cp) =>
					cp.product.group === product.group &&
					cp.status === CusProductStatus.Scheduled &&
					(cp.internal_entity_id
						? cp.internal_entity_id == cusProduct.internal_entity_id
						: nullish(cp.internal_entity_id)),
			);

			if (!curScheduledProduct) return scheduleIndexes.push(index);

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
			if (isOneOffPrice({ price })) continue;

			const relatedEnt = getPriceEntitlement(price, ents);
			const options = getPriceOptions(price, cusProduct.options);
			let existingUsage = getExistingUsageFromCusProducts({
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
							quantity: Number(cusProduct.quantity || 1),
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
				lineItem.quantity = Math.max(lineItem.quantity, 0);
				if (addToSub) {
					const existingIndex = supposedSubItems.findIndex(
						(si: any) => si.price === lineItem.price,
					);

					if (existingIndex !== -1) {
						// @ts-ignore
						supposedSubItems[existingIndex].quantity += lineItem.quantity;
					} else {
						supposedSubItems.push({
							...res.lineItem,
							priceStr: `${product.id}-${formatPrice({ price })}`,
							stripeProdId: product.processor?.id,
							autumnPrice: price,
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

	const sub = subs.find((sub) => sub.id === subId);
	assert(!!sub, `Sub ${subId} should exist`);

	const actualItems = sub!.items.data.map((item: any) => ({
		price: item.price.id,
		quantity: item.quantity || 0,
		stripeProdId: item.price.product,
	}));

	// console.log("Actual items:");
	// await logPhaseItems({
	//   db,
	//   items: actualItems,
	// });
	// console.log("Expected items:");
	// await logPhaseItems({
	//   db,
	//   items: actualItems,
	// });

	await compareActualItems({
		actualItems,
		expectedItems: supposedSubItems,
		type: "sub",
		fullCus,
		db,
	});

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

	const finalShouldBeCanceled = cusSubShouldBeCanceled;

	if (finalShouldBeCanceled) {
		assert(!sub!.schedule, `sub ${subId} should NOT have a schedule`);
		assert(subIsCanceled({ sub: sub! }), `sub ${subId} should be canceled`);
		return;
	}

	const schedule =
		supposedPhases.length > 0
			? schedules.find((s) => s.id === sub!.schedule)
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

	assert(!sub!.cancel_at, `sub ${subId} should not be canceled`);
};
