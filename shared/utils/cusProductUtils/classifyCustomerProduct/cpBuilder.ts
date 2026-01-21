import type { FullCusProduct } from "@models/cusProductModels/cusProductModels.js";
import {
	cusProductHasSubscription,
	customerProductHasActiveStatus,
	customerProductHasRelevantStatus,
	customerProductHasSubscriptionSchedule,
	hasCustomerProductStarted,
	isCusProductOnEntity,
	isCustomerProductAddOn,
	isCustomerProductCanceling,
	isCustomerProductFree,
	isCustomerProductMain,
	isCustomerProductOneOff,
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
	isCustomerProductPaid,
	isCustomerProductPaidRecurring,
	isCustomerProductRecurring,
	isCustomerProductScheduled,
	isCustomerProductTrialing,
} from "./classifyCustomerProduct";

type Predicate = (cp: FullCusProduct) => boolean;

/**
 * Fluent builder for checking customer product conditions.
 * Supports both AND (chaining) and OR (.or getter) operations with left-to-right evaluation.
 *
 * @example
 * // AND conditions
 * if (cp(customerProduct).paid().recurring().valid) { ... }
 *
 * @example
 * // OR conditions (left-to-right: free OR onStripeSub OR onStripeSchedule)
 * if (cp(customerProduct).free().or.onStripeSubscription({...}).or.onStripeSchedule({...}).valid) { ... }
 *
 * @example
 * // Mixed: ((a AND b) OR c) AND d
 * cp(x).a().b().or.c().d().valid
 */
class CustomerProductChecker {
	private customerProduct: FullCusProduct | undefined;
	private accumulatedResult: boolean | null = null;
	private pendingPredicates: Predicate[] = [];

	constructor(customerProduct: FullCusProduct | undefined) {
		this.customerProduct = customerProduct;
	}

	/** Flushes pending predicates, AND's them together, then OR's with accumulated result */
	private flushPredicates(): void {
		if (this.pendingPredicates.length === 0) return;
		if (!this.customerProduct) {
			this.accumulatedResult = false;
			this.pendingPredicates = [];
			return;
		}

		const groupResult = this.pendingPredicates.every((p) =>
			p(this.customerProduct!),
		);

		if (this.accumulatedResult === null) {
			this.accumulatedResult = groupResult;
		} else {
			this.accumulatedResult = this.accumulatedResult || groupResult;
		}

		this.pendingPredicates = [];
	}

	/** OR with previous conditions. Evaluated left-to-right. */
	get or(): this {
		this.flushPredicates();
		return this;
	}

	/** Evaluates all conditions and returns the result */
	get valid(): boolean {
		if (!this.customerProduct) return false;
		this.flushPredicates();
		return this.accumulatedResult ?? true;
	}

	/** Product is a main product (not an add-on) */
	main() {
		this.pendingPredicates.push(isCustomerProductMain);
		return this;
	}

	/** Product is an add-on */
	addOn() {
		this.pendingPredicates.push(isCustomerProductAddOn);
		return this;
	}

	/** Product is a one-off (paid and all prices are one off) */
	oneOff() {
		this.pendingPredicates.push(isCustomerProductOneOff);
		return this;
	}

	/** Product has NO one off prices (can be free or paid) */
	recurring() {
		this.pendingPredicates.push(isCustomerProductRecurring);
		return this;
	}

	/** Product has no prices (free) */
	free() {
		this.pendingPredicates.push(isCustomerProductFree);
		return this;
	}

	/** Product has at least one price (not free) */
	paid() {
		this.pendingPredicates.push(isCustomerProductPaid);
		return this;
	}

	/** Product is paid AND recurring (not free, not one-off) */
	paidRecurring() {
		this.pendingPredicates.push(isCustomerProductPaidRecurring);
		return this;
	}

	/** Product has canceled_at set */
	canceling() {
		this.pendingPredicates.push(isCustomerProductCanceling);
		return this;
	}

	/** Product is not canceling */
	notCanceling() {
		this.pendingPredicates.push((cp) => !isCustomerProductCanceling(cp));
		return this;
	}

	/** Product has an active status (Active or PastDue) */
	hasActiveStatus() {
		this.pendingPredicates.push(customerProductHasActiveStatus);
		return this;
	}

	/** Product has a relevant status (Active, PastDue, or Scheduled) */
	hasRelevantStatus() {
		this.pendingPredicates.push(customerProductHasRelevantStatus);
		return this;
	}

	/** Product is active (Active or PastDue) AND recurring (no one off prices) */
	activeRecurring() {
		this.pendingPredicates.push(customerProductHasActiveStatus);
		this.pendingPredicates.push(isCustomerProductRecurring);
		return this;
	}

	/** Product has scheduled status */
	scheduled() {
		this.pendingPredicates.push(isCustomerProductScheduled);
		return this;
	}

	/** Product is trialing */
	trialing({ nowMs }: { nowMs?: number } = {}) {
		this.pendingPredicates.push(
			(cp) => !!isCustomerProductTrialing(cp, { nowMs }),
		);
		return this;
	}

	/** Product is scheduled and has started (starts_at <= nowMs + tolerance) */
	hasStarted({ nowMs, toleranceMs }: { nowMs: number; toleranceMs?: number }) {
		this.pendingPredicates.push((cp) =>
			hasCustomerProductStarted(cp, { nowMs, toleranceMs }),
		);
		return this;
	}

	/** Product has a Stripe subscription attached */
	hasSubscription() {
		this.pendingPredicates.push((cp) =>
			cusProductHasSubscription({ cusProduct: cp }),
		);
		return this;
	}

	/** Product has a Stripe subscription schedule attached */
	hasSchedule() {
		this.pendingPredicates.push((cp) =>
			customerProductHasSubscriptionSchedule({ cusProduct: cp }),
		);
		return this;
	}

	/** Product is on a specific Stripe subscription */
	onStripeSubscription({
		stripeSubscriptionId,
	}: {
		stripeSubscriptionId: string;
	}) {
		this.pendingPredicates.push(
			(cp) =>
				!!isCustomerProductOnStripeSubscription({
					customerProduct: cp,
					stripeSubscriptionId,
				}),
		);
		return this;
	}

	/** Product is on a specific Stripe subscription schedule */
	onStripeSchedule({
		stripeSubscriptionScheduleId,
	}: {
		stripeSubscriptionScheduleId: string;
	}) {
		this.pendingPredicates.push(
			(cp) =>
				!!isCustomerProductOnStripeSubscriptionSchedule({
					customerProduct: cp,
					stripeSubscriptionScheduleId,
				}),
		);
		return this;
	}

	/** Product is on a specific entity (or no entity if undefined) */
	onEntity({ internalEntityId }: { internalEntityId?: string }) {
		this.pendingPredicates.push((cp) =>
			isCusProductOnEntity({ cusProduct: cp, internalEntityId }),
		);
		return this;
	}

	/** Product has a specific product ID */
	hasProductId({ productId }: { productId: string }) {
		this.pendingPredicates.push((cp) => cp.product.id === productId);
		return this;
	}

	/** Product belongs to a specific product group */
	hasProductGroup({ productGroup }: { productGroup: string }) {
		this.pendingPredicates.push((cp) => cp.product.group === productGroup);
		return this;
	}
}

/**
 * Create a fluent checker for customer product conditions.
 *
 * @example
 * // AND conditions
 * if (cp(customerProduct).paid().recurring().valid) { ... }
 *
 * @example
 * // OR conditions
 * if (cp(customerProduct).free().or.onStripeSubscription({ stripeSubscriptionId }).valid) { ... }
 */
export const cp = (customerProduct: FullCusProduct | undefined) =>
	new CustomerProductChecker(customerProduct);
