import type { FullCusProduct } from "@models/cusProductModels/cusProductModels.js";
import {
	cusProductHasSubscription,
	customerProductHasActiveStatus,
	customerProductHasRelevantStatus,
	customerProductHasSubscriptionSchedule,
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
 *
 * @example
 * // Destructure the result
 * const { valid } = cp(customerProduct).paid().recurring();
 * if (valid) { ... }
 *
 * @example
 * // Use .valid directly
 * if (cp(customerProduct).paid().recurring().valid) { ... }
 */
class CustomerProductChecker {
	private customerProduct: FullCusProduct | undefined;
	private predicates: Predicate[] = [];

	constructor(customerProduct: FullCusProduct | undefined) {
		this.customerProduct = customerProduct;
	}

	/** Evaluates all conditions and returns the result */
	get valid(): boolean {
		if (!this.customerProduct) return false;
		return this.predicates.every((p) => p(this.customerProduct!));
	}

	/** Product is a main product (not an add-on) */
	main() {
		this.predicates.push(isCustomerProductMain);
		return this;
	}

	/** Product is an add-on */
	addOn() {
		this.predicates.push(isCustomerProductAddOn);
		return this;
	}

	/** Product is a one-off (paid and all prices are one off) */
	oneOff() {
		this.predicates.push(isCustomerProductOneOff);
		return this;
	}

	/** Product has NO one off prices (can be free or paid) */
	recurring() {
		this.predicates.push(isCustomerProductRecurring);
		return this;
	}

	/** Product has no prices (free) */
	free() {
		this.predicates.push(isCustomerProductFree);
		return this;
	}

	/** Product has at least one price (not free) */
	paid() {
		this.predicates.push(isCustomerProductPaid);
		return this;
	}

	/** Product is paid AND recurring (not free, not one-off) */
	paidRecurring() {
		this.predicates.push(isCustomerProductPaidRecurring);
		return this;
	}

	/** Product has canceled_at set */
	canceling() {
		this.predicates.push(isCustomerProductCanceling);
		return this;
	}

	/** Product is not canceling */
	notCanceling() {
		this.predicates.push((cp) => !isCustomerProductCanceling(cp));
		return this;
	}

	/** Product has an active status (Active or PastDue) */
	hasActiveStatus() {
		this.predicates.push(customerProductHasActiveStatus);
		return this;
	}

	/** Product has a relevant status (Active, PastDue, or Scheduled) */
	hasRelevantStatus() {
		this.predicates.push(customerProductHasRelevantStatus);
		return this;
	}

	/** Product is active (Active or PastDue) AND recurring (no one off prices) */
	activeRecurring() {
		this.predicates.push(customerProductHasActiveStatus);
		this.predicates.push(isCustomerProductRecurring);
		return this;
	}

	/** Product has scheduled status */
	scheduled() {
		this.predicates.push(isCustomerProductScheduled);
		return this;
	}

	/** Product is trialing */
	trialing({ nowMs }: { nowMs?: number } = {}) {
		this.predicates.push((cp) => !!isCustomerProductTrialing(cp, { nowMs }));
		return this;
	}

	/** Product has a Stripe subscription attached */
	hasSubscription() {
		this.predicates.push((cp) => cusProductHasSubscription({ cusProduct: cp }));
		return this;
	}

	/** Product has a Stripe subscription schedule attached */
	hasSchedule() {
		this.predicates.push((cp) =>
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
		this.predicates.push(
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
		this.predicates.push(
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
		this.predicates.push((cp) =>
			isCusProductOnEntity({ cusProduct: cp, internalEntityId }),
		);
		return this;
	}

	/** Product has a specific product ID */
	hasProductId({ productId }: { productId: string }) {
		this.predicates.push((cp) => cp.product.id === productId);
		return this;
	}

	/** Product belongs to a specific product group */
	hasProductGroup({ productGroup }: { productGroup: string }) {
		this.predicates.push((cp) => cp.product.group === productGroup);
		return this;
	}
}

/**
 * Create a fluent checker for customer product conditions.
 *
 * @example
 * const { valid } = cp(customerProduct).paid().recurring();
 *
 * @example
 * if (cp(customerProduct).hasActiveStatus().main().valid) { ... }
 */
export const cp = (customerProduct: FullCusProduct | undefined) =>
	new CustomerProductChecker(customerProduct);
