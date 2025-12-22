/** biome-ignore-all lint/suspicious/noExplicitAny: <> */
import assert from "node:assert";
import {
	ApiVersion,
	type AppEnv,
	CusProductStatus,
	cusProductToEnts,
	cusProductToPrices,
	cusProductToProduct,
	type FullCusProduct,
	type FullCustomer,
	isFixedPrice,
	isOneOffPrice,
	isPrepaidPrice,
	type Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { priceToStripeItem } from "@server/external/stripe/priceToStripeItem/priceToStripeItem";
import { subIsCanceled } from "@server/external/stripe/stripeSubUtils";
import {
	cusProductInPhase,
	logPhaseItems,
	similarUnix,
} from "@server/internal/customers/attach/mergeUtils/phaseUtils/phaseUtils";
import { ACTIVE_STATUSES } from "@server/internal/customers/cusProducts/CusProductService";
import { getExistingUsageFromCusProducts } from "@server/internal/customers/cusProducts/cusEnts/cusEntUtils";
import { getExistingCusProducts } from "@server/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";
import { getUniqueUpcomingSchedulePairs } from "@server/internal/customers/cusProducts/cusProductUtils/getUpcomingSchedules";
import { PriceService } from "@server/internal/products/prices/PriceService";
import {
	formatPrice,
	getPriceEntitlement,
	getPriceOptions,
} from "@server/internal/products/prices/priceUtils";
import { isFreeProduct } from "@server/internal/products/productUtils";
import type Stripe from "stripe";
import { formatUnixToDateTime, nullish } from "../genUtils";
import { allCusProductsOnSubFree } from "./allCusProductsOnSubFree";
import type { SubItemDetail } from "./stateCheckTypes";

/** Error thrown when subscription items don't match expected items. Carries item details for debugging. */
export class SubItemMismatchError extends Error {
	subId: string;
	actualItems: SubItemDetail[];
	expectedItems: SubItemDetail[];

	constructor({
		message,
		subId,
		actualItems,
		expectedItems,
	}: {
		message: string;
		subId: string;
		actualItems: SubItemDetail[];
		expectedItems: SubItemDetail[];
	}) {
		super(message);
		this.name = "SubItemMismatchError";
		this.subId = subId;
		this.actualItems = actualItems;
		this.expectedItems = expectedItems;
	}
}

const defaultApiVersion = ApiVersion.V1_2;

const cusProductToSubIds = ({
	cusProducts,
}: {
	cusProducts: FullCusProduct[];
}) => {
	return [...new Set(cusProducts.flatMap((cp) => cp.subscription_ids || []))];
};

/** Converts raw items to SubItemDetail format with product/price names */
const itemsToSubItemDetails = async ({
	items,
	db,
}: {
	items: { price: string; quantity: number; stripeProdId?: string }[];
	db: DrizzleCli;
}): Promise<SubItemDetail[]> => {
	const priceIds = items.map((item) => item.price).filter(Boolean);
	const autumnPrices = await PriceService.getByStripeIds({
		db,
		stripePriceIds: priceIds,
	});

	return items.map((item) => {
		const autumnPrice = autumnPrices[item.price];
		return {
			priceId: item.price,
			quantity: item.quantity || 0,
			productName: autumnPrice?.product?.name,
			priceName: autumnPrice ? formatPrice({ price: autumnPrice }) : undefined,
		};
	});
};

const compareActualItems = async ({
	actualItems,
	expectedItems,
	type,
	fullCus,
	db,
	phaseStartsAt,
	subId,
}: {
	actualItems: any[];
	expectedItems: any[];
	type: "sub" | "schedule";
	fullCus: FullCustomer;
	phaseStartsAt?: number;
	db: DrizzleCli;
	subId: string;
}) => {
	/** Helper to throw SubItemMismatchError with item details */
	const throwMismatchError = async (message: string) => {
		const actualDetails = await itemsToSubItemDetails({
			items: actualItems,
			db,
		});
		const expectedDetails = await itemsToSubItemDetails({
			items: expectedItems,
			db,
		});
		throw new SubItemMismatchError({
			message,
			subId,
			actualItems: actualDetails,
			expectedItems: expectedDetails,
		});
	};

	let skippedCount = 0;

	for (const expectedItem of expectedItems) {
		let actualItem = actualItems.find((item: any) => {
			if (item.price === (expectedItem as any).price) return true;

			// If only one item, allow matching by stripe prod id

			// If prices match, allow item.stripeProdId to match...

			// if (item.stripeProdId == (expectedItem as any).stripeProdId) return true;

			return false;
		});

		if (isFixedPrice(expectedItem.autumnPrice) && !actualItem) {
			actualItem = actualItems.find((item: any) => {
				return item.stripeProdId === expectedItem.stripeProdId;
			});
		}

		if (!actualItem) {
			// Allow skipping if canSkip is true
			if (expectedItem.canSkip) {
				skippedCount++;
				continue;
			}

			const { autumnPrice: _, ...rest } = expectedItem;
			console.log(`(${type}) Missing item:`, rest);

			// Actual items
			console.log(`(${type}) Actual items (${actualItems.length}):`);
			await logPhaseItems({
				db,
				items: actualItems,
				withId: true,
			});

			console.log(`(${type}) Expected items (${expectedItems.length}):`);
			await logPhaseItems({
				db,
				items: expectedItems,
			});

			await throwMismatchError(
				`actual item should exist for price ${expectedItem.price}`,
			);
		}

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
					withId: true,
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

				await throwMismatchError(
					`actual items quantity (${actualItem?.quantity}) should be equals to ${expectedItem.quantity}`,
				);
			}
		}
	}

	if (actualItems.length !== expectedItems.length) {
		// Fallback: allow if length matches after accounting for skipped items
		const expectedItemsCount = expectedItems.length - skippedCount;
		if (actualItems.length !== expectedItemsCount) {
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

			await throwMismatchError(
				`actual items length (${actualItems.length}) should be equals to expected items length (${expectedItems.length}) for sub ${subId}`,
			);
		}
	}
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
	// 1. Only 1 sub ID available
	const cusProducts = fullCus.customer_products;
	const subIds = cusProductToSubIds({ cusProducts });

	for (const subId of subIds) {
		// Filter to cusProducts with this specific subId (use const to avoid cumulative filtering)
		const subCusProducts = cusProducts.filter((cp) =>
			cp.subscription_ids?.includes(subId!),
		);

		// Get the items that should be in the sub
		const supposedSubItems = [];

		const scheduleUnixes = getUniqueUpcomingSchedulePairs({
			cusProducts: subCusProducts,
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

		for (const cusProduct of subCusProducts) {
			const prices = cusProductToPrices({ cusProduct });
			const ents = cusProductToEnts({ cusProduct });
			const product = cusProductToProduct({ cusProduct });

			// Add to schedules
			const scheduleIndexes: number[] = [];
			const apiVersion = cusProduct.api_semver || defaultApiVersion;

			// if (isFreeProduct(product.prices)) {
			// 	assert(
			// 		cusProduct.subscription_ids?.length === 0,
			// 		`free product ${cusProduct.product.name} should have no subs`,
			// 	);
			// 	continue;
			// }

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
				const curScheduledProduct = subCusProducts.find(
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
				subCusProducts.some(
					(cp) =>
						cp.product.group === product.group &&
						ACTIVE_STATUSES.includes(cp.status),
				);

			const addToSub = cusProduct.status !== CusProductStatus.Scheduled;

			for (const price of prices) {
				if (isOneOffPrice(price)) continue;

				const relatedEnt = getPriceEntitlement(price, ents);
				const options = getPriceOptions(price, cusProduct.options);
				const existingUsage = getExistingUsageFromCusProducts({
					entitlement: relatedEnt,
					cusProducts: subCusProducts,
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
					// productOptions: cusProduct.quantity
					// 	? {
					// 			product_id: product.id,
					// 			quantity: Number(cusProduct.quantity || 1),
					// 		}
					// 	: undefined,
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
							supposedSubItems[existingIndex].quantity += lineItem.quantity;
						} else {
							supposedSubItems.push({
								...res.lineItem,
								priceStr: `${product.id}-${formatPrice({ price })}`,
								stripeProdId: product.processor?.id,
								autumnPrice: price,
								canSkip: isPrepaidPrice(price) && res?.lineItem?.quantity === 0,
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

		// Check if all free products are
		const sub = subs.find((sub) => sub.id === subId);
		const allCusProductsFree = allCusProductsOnSubFree({
			fullCus,
			subId: subId!,
		});

		if (allCusProductsFree) {
			// assert(!sub, `Sub ${subId} should not exist`);
			continue;
		}

		assert(!!sub, `Sub ${subId} should exist`);

		if (sub) {
			const actualItems = sub!.items.data.map((item: any) => ({
				id: item.id,
				price: item.price.id,
				quantity: item.quantity || 0,
				stripeProdId: item.price.product,
			}));

			await compareActualItems({
				actualItems,
				expectedItems: supposedSubItems,
				type: "sub",
				fullCus,
				db,
				subId,
			});
		}

		// Should be canceled

		const cusSubShouldBeCanceled = subCusProducts.every((cp) => {
			if (cp.subscription_ids?.includes(subId!)) {
				// 1. Get scheduled product

				const { curScheduledProduct } = getExistingCusProducts({
					cusProducts: fullCus.customer_products,
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
			continue;
		}

		const schedule =
			supposedPhases.length > 0
				? schedules.find((s) => s.id === sub!.schedule)
				: null;

		for (let i = 0; i < supposedPhases.length; i++) {
			const supposedPhase = supposedPhases[i];

			if (supposedPhase.items.length === 0) continue;

			const actualPhase = schedule?.phases?.[i + 1];
			assert(
				(schedule?.phases.length ?? 0) > i + 1,
				`Schedule should have more than ${i + 1} phases`,
			);

			assert(
				similarUnix({
					unix1: supposedPhase.start_date,
					unix2: actualPhase!.start_date * 1000,
				}),
				`Phase ${i} start date mismatch`,
			);

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
				subId,
			});
		}

		assert(
			!sub!.cancel_at,
			`sub ${subId} should not be canceled, was cancelled at ${
				sub!.cancel_at
					? new Date(
							sub!.cancel_at > 1e12 ? sub!.cancel_at : sub!.cancel_at * 1000,
						).toLocaleString("en-GB", {
							day: "numeric",
							month: "short",
							year: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						})
					: sub!.cancel_at
			}`,
		);
	}
};
