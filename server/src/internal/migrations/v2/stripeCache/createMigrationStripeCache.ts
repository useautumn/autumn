import type {
	FullCusProduct,
	FullCustomer,
	StripeDiscountWithCoupon,
} from "@autumn/shared";
import type Stripe from "stripe";
import type {
	StripeCustomerWithDiscount,
	StripeSubscriptionWithDiscounts,
} from "@/external/stripe/subscriptions/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { fetchStripeCustomerForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeCustomerForBilling.js";
import { fetchStripeDiscountsForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeDiscountsForBilling.js";
import { fetchStripeSubscriptionForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeSubscriptionForBilling.js";
import { fetchStripeSubscriptionScheduleForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeSubscriptionScheduleForBilling.js";

type StripeCustomerContext = {
	stripeCustomer?: StripeCustomerWithDiscount;
	paymentMethod?: Stripe.PaymentMethod;
	testClockFrozenTime?: number;
};

export type MigrationStripeCache = {
	getStripeCustomer: () => Promise<StripeCustomerContext>;
	getStripeSubscription: (args: {
		customerProduct: FullCusProduct;
	}) => Promise<StripeSubscriptionWithDiscounts | undefined>;
	getStripeSubscriptionSchedule: (args: {
		customerProduct: FullCusProduct;
		stripeSubscription?: Stripe.Subscription;
	}) => Promise<Stripe.SubscriptionSchedule | undefined>;
	getStripeDiscounts: (args: {
		customerProduct: FullCusProduct;
		stripeSubscription?: StripeSubscriptionWithDiscounts;
	}) => Promise<StripeDiscountWithCoupon[]>;
};

const getSubscriptionId = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}) => customerProduct.subscription_ids?.[0] ?? null;

const getScheduleCacheKey = ({
	customerProduct,
	stripeSubscription,
}: {
	customerProduct: FullCusProduct;
	stripeSubscription?: Stripe.Subscription;
}) => {
	const scheduleId =
		typeof stripeSubscription?.schedule === "string"
			? stripeSubscription.schedule
			: customerProduct.scheduled_ids?.[0];

	return scheduleId ?? getSubscriptionId({ customerProduct });
};

export const createMigrationStripeCache = ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): MigrationStripeCache => {
	let stripeCustomerPromise: Promise<StripeCustomerContext> | undefined;
	const subscriptionPromises = new Map<
		string,
		Promise<StripeSubscriptionWithDiscounts | undefined>
	>();
	const schedulePromises = new Map<
		string,
		Promise<Stripe.SubscriptionSchedule | undefined>
	>();
	const discountPromises = new Map<
		string,
		Promise<StripeDiscountWithCoupon[]>
	>();

	const getStripeCustomer = async () => {
		if (!stripeCustomerPromise) {
			stripeCustomerPromise = fetchStripeCustomerForBilling({
				ctx,
				fullCus: fullCustomer,
			}).then(({ stripeCus, paymentMethod, testClockFrozenTime }) => ({
				stripeCustomer: stripeCus as StripeCustomerWithDiscount | undefined,
				paymentMethod,
				testClockFrozenTime,
			}));
		}

		return stripeCustomerPromise;
	};

	const getStripeSubscription = async ({
		customerProduct,
	}: {
		customerProduct: FullCusProduct;
	}) => {
		const subscriptionId = getSubscriptionId({ customerProduct });
		if (!subscriptionId) return undefined;

		const existingPromise = subscriptionPromises.get(subscriptionId);
		if (existingPromise) return existingPromise;

		const promise = fetchStripeSubscriptionForBilling({
			ctx,
			fullCus: fullCustomer,
			targetCusProductId: customerProduct.id,
		});
		subscriptionPromises.set(subscriptionId, promise);

		return promise;
	};

	const getStripeSubscriptionSchedule = async ({
		customerProduct,
		stripeSubscription,
	}: {
		customerProduct: FullCusProduct;
		stripeSubscription?: Stripe.Subscription;
	}) => {
		const cacheKey = getScheduleCacheKey({
			customerProduct,
			stripeSubscription,
		});
		if (!cacheKey) return undefined;

		const existingPromise = schedulePromises.get(cacheKey);
		if (existingPromise) return existingPromise;

		const promise = fetchStripeSubscriptionScheduleForBilling({
			ctx,
			fullCus: fullCustomer,
			products: [],
			targetCusProductId: customerProduct.id,
			subscriptionScheduleId:
				typeof stripeSubscription?.schedule === "string"
					? stripeSubscription.schedule
					: undefined,
		});
		schedulePromises.set(cacheKey, promise);

		return promise;
	};

	const getStripeDiscounts = async ({
		customerProduct,
		stripeSubscription,
	}: {
		customerProduct: FullCusProduct;
		stripeSubscription?: StripeSubscriptionWithDiscounts;
	}) => {
		const subscriptionId = getSubscriptionId({ customerProduct });
		const cacheKey = subscriptionId ?? "customer";

		const existingPromise = discountPromises.get(cacheKey);
		if (existingPromise) return existingPromise;

		const promise = getStripeCustomer().then(({ stripeCustomer }) =>
			fetchStripeDiscountsForBilling({
				ctx,
				stripeSubscription,
				stripeCustomer,
			}),
		);
		discountPromises.set(cacheKey, promise);

		return promise;
	};

	return {
		getStripeCustomer,
		getStripeSubscription,
		getStripeSubscriptionSchedule,
		getStripeDiscounts,
	};
};
