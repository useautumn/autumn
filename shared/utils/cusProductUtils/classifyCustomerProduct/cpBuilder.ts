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
	isCustomerProductCustomerScoped,
	isCustomerProductFree,
	isCustomerProductMain,
	isCustomerProductOneOff,
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
	isCustomerProductPaid,
	isCustomerProductPaidRecurring,
	isCustomerProductRecurring,
	isCustomerProductRevertingTrial,
	isCustomerProductScheduled,
	isCustomerProductTrialing,
} from "./classifyCustomerProduct";

type Predicate = (cp: FullCusProduct) => boolean;

class CustomerProductChecker {
	private customerProduct: FullCusProduct | undefined;
	private accumulatedResult: boolean | null = null;
	private pendingPredicates: Predicate[] = [];

	constructor(customerProduct: FullCusProduct | undefined) {
		this.customerProduct = customerProduct;
	}

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

	get or(): this {
		this.flushPredicates();
		return this;
	}

	get valid(): boolean {
		if (!this.customerProduct) return false;
		this.flushPredicates();
		return this.accumulatedResult ?? true;
	}

	main() {
		this.pendingPredicates.push(isCustomerProductMain);
		return this;
	}

	addOn() {
		this.pendingPredicates.push(isCustomerProductAddOn);
		return this;
	}

	oneOff() {
		this.pendingPredicates.push(isCustomerProductOneOff);
		return this;
	}

	recurring() {
		this.pendingPredicates.push(isCustomerProductRecurring);
		return this;
	}

	free() {
		this.pendingPredicates.push(isCustomerProductFree);
		return this;
	}

	paid() {
		this.pendingPredicates.push(isCustomerProductPaid);
		return this;
	}

	paidRecurring() {
		this.pendingPredicates.push(isCustomerProductPaidRecurring);
		return this;
	}

	canceling() {
		this.pendingPredicates.push(isCustomerProductCanceling);
		return this;
	}

	notCanceling() {
		this.pendingPredicates.push((cp) => !isCustomerProductCanceling(cp));
		return this;
	}

	hasActiveStatus() {
		this.pendingPredicates.push(customerProductHasActiveStatus);
		return this;
	}

	hasRelevantStatus() {
		this.pendingPredicates.push(customerProductHasRelevantStatus);
		return this;
	}

	activeRecurring() {
		this.pendingPredicates.push(customerProductHasActiveStatus);
		this.pendingPredicates.push(isCustomerProductRecurring);
		return this;
	}

	scheduled() {
		this.pendingPredicates.push(isCustomerProductScheduled);
		return this;
	}

	trialing({ nowMs }: { nowMs?: number } = {}) {
		this.pendingPredicates.push(
			(cp) => !!isCustomerProductTrialing(cp, { nowMs }),
		);
		return this;
	}

	revertingTrial() {
		this.pendingPredicates.push(isCustomerProductRevertingTrial);
		return this;
	}

	hasStarted({ nowMs, toleranceMs }: { nowMs: number; toleranceMs?: number }) {
		this.pendingPredicates.push((cp) =>
			hasCustomerProductStarted(cp, { nowMs, toleranceMs }),
		);
		return this;
	}

	hasSubscription() {
		this.pendingPredicates.push((cp) =>
			cusProductHasSubscription({ cusProduct: cp }),
		);
		return this;
	}

	hasSchedule() {
		this.pendingPredicates.push((cp) =>
			customerProductHasSubscriptionSchedule({ cusProduct: cp }),
		);
		return this;
	}

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

	onStripeSchedule({
		stripeSubscriptionScheduleId,
	}: {
		stripeSubscriptionScheduleId: string | undefined;
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

	onEntity({ internalEntityId }: { internalEntityId?: string }) {
		this.pendingPredicates.push((cp) =>
			isCusProductOnEntity({ cusProduct: cp, internalEntityId }),
		);
		return this;
	}

	hasProductId({ productId }: { productId: string }) {
		this.pendingPredicates.push((cp) => cp.product.id === productId);
		return this;
	}

	hasProductGroup({ productGroup }: { productGroup: string }) {
		this.pendingPredicates.push((cp) => cp.product.group === productGroup);
		return this;
	}

	customerScoped() {
		this.pendingPredicates.push(isCustomerProductCustomerScoped);
		return this;
	}
}

export const cp = (customerProduct: FullCusProduct | undefined) =>
	new CustomerProductChecker(customerProduct);
