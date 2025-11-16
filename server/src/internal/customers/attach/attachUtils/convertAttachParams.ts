import { cusProductToProduct } from "@autumn/shared";
import type Stripe from "stripe";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getExistingCusProducts } from "../../cusProducts/cusProductUtils/getExistingCusProducts.js";

export const attachParamsToCurCusProduct = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	const { curMainProduct, curSameProduct, curScheduledProduct } =
		attachParamToCusProducts({ attachParams });

	return curSameProduct || curMainProduct;
};

export const attachParamToCusProducts = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	if (attachParams.products.length === 0 && !attachParams.cusProduct) {
		throw new Error(
			"attachParams.products should have at least one product OR attachParams.cusProduct should exist",
		);
	}

	const product =
		attachParams.products.length > 0
			? attachParams.products[0]
			: cusProductToProduct({ cusProduct: attachParams.cusProduct! });

	const { curMainProduct, curSameProduct, curScheduledProduct } =
		getExistingCusProducts({
			product,
			cusProducts: attachParams.cusProducts!,
			internalEntityId: attachParams.internalEntityId,
		});

	const curCusProduct = curMainProduct || curSameProduct;

	return { curMainProduct, curSameProduct, curScheduledProduct, curCusProduct };
};

export const attachParamsToProduct = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	const { org, features, prices, entitlements, freeTrial } = attachParams;
	const product = attachParams.products[0];

	return {
		...product,
		prices,
		entitlements,
		free_trial: freeTrial,
	};
};

export const getSubForAttach = async ({
	subId,
	stripeCli,
}: {
	subId: string;
	stripeCli: Stripe;
}) => {
	const sub = await stripeCli.subscriptions.retrieve(subId, {
		expand: ["items.data.price.tiers"],
	});

	return sub;
};

export const getCustomerSub = async ({
	attachParams,
	onlySubId,
}: {
	attachParams: AttachParams;
	onlySubId?: boolean;
}) => {
	const { stripeCli } = attachParams;
	const fullCus = attachParams.customer;
	const cusProducts = fullCus.customer_products;

	const targetGroup = attachParams.products[0].group;
	const targetEntityId = attachParams.internalEntityId || null;
	const targetProductId = attachParams.products[0].id;

	cusProducts.sort((a, b) => {
		// 1. Check same group
		const aGroupMatches = a.product.group === targetGroup;
		const bGroupMatches = b.product.group === targetGroup;

		if (aGroupMatches && !bGroupMatches) return -1;
		if (!aGroupMatches && bGroupMatches) return 1;

		// 2. Check main product
		const aMain = !a.product.is_add_on;
		const bMain = !b.product.is_add_on;

		if (aMain && !bMain) return -1;
		if (!aMain && bMain) return 1;

		// 3. Check same product
		const aProductIdMatches = a.product.id === targetProductId;
		const bProductIdMatches = b.product.id === targetProductId;

		if (aProductIdMatches && !bProductIdMatches) return -1;
		if (!aProductIdMatches && bProductIdMatches) return 1;

		// 4. Check same entity
		const aEntityIdMatches = (a.internal_entity_id || null) === targetEntityId;
		const bEntityIdMatches = (b.internal_entity_id || null) === targetEntityId;

		if (aEntityIdMatches && !bEntityIdMatches) return -1;
		if (!aEntityIdMatches && bEntityIdMatches) return 1;

		return 0;
	});

	// const subId = cusProducts.flatMap((cp) => cp.subscription_ids || [])?.[0];
	const cusProduct = cusProducts.find(
		(cp) => cp.subscription_ids && cp.subscription_ids.length > 0,
	);

	if (!cusProduct) return { sub: undefined, cusProduct: undefined };
	const subId = cusProduct.subscription_ids![0];

	if (onlySubId) {
		return { subId: subId, sub: undefined, cusProduct: undefined };
	}

	// If there's only one customer product on sub, and it's still trialing, return undefined, because should just replace sub.
	const curCusProduct = attachParamsToCurCusProduct({ attachParams });

	const sub = await stripeCli.subscriptions.retrieve(subId, {
		expand: [
			"items.data.price.tiers",
			"discounts.source.coupon",
			"discounts.source.coupon.applies_to",
			// "discounts.coupon.applies_to",
			"latest_invoice",
		],
	});

	return { subId, sub, cusProduct };
};

export const getCustomerSchedule = async ({
	attachParams,
	subId,
	logger,
}: {
	attachParams: AttachParams;
	subId?: string;
	logger: any;
}) => {
	const { stripeCli } = attachParams;
	const fullCus = attachParams.customer;
	const cusProducts = fullCus.customer_products;

	const targetGroup = attachParams.products[0].group;
	const targetEntityId = attachParams.internalEntityId || null;
	const targetProductId = attachParams.products[0].id;

	cusProducts.sort((a, b) => {
		// 1. Check same group
		const aGroupMatches = a.product.group === targetGroup;
		const bGroupMatches = b.product.group === targetGroup;

		if (aGroupMatches && !bGroupMatches) return -1;
		if (!aGroupMatches && bGroupMatches) return 1;

		// 2. Check main product
		const aMain = !a.product.is_add_on;
		const bMain = !b.product.is_add_on;

		if (aMain && !bMain) return -1;
		if (!aMain && bMain) return 1;

		// 3. Check same product
		const aProductIdMatches = a.product.id === targetProductId;
		const bProductIdMatches = b.product.id === targetProductId;

		if (aProductIdMatches && !bProductIdMatches) return -1;
		if (!aProductIdMatches && bProductIdMatches) return 1;

		// 4. Check same entity
		const aEntityIdMatches = (a.internal_entity_id || null) === targetEntityId;
		const bEntityIdMatches = (b.internal_entity_id || null) === targetEntityId;

		if (aEntityIdMatches && !bEntityIdMatches) return -1;
		if (!aEntityIdMatches && bEntityIdMatches) return 1;

		return 0;
	});

	// const subId = cusProducts.flatMap((cp) => cp.subscription_ids || [])?.[0];
	const scheduleIds = cusProducts.flatMap((cp) => cp.scheduled_ids || []);
	if (scheduleIds.length === 0) return { schedule: undefined };

	try {
		const schedules = await stripeCli.subscriptionSchedules.list({
			customer: fullCus.processor.id!,
			expand: ["data.phases.items.price"],
		});

		const schedule = schedules.data.find(
			(schedule) =>
				scheduleIds.includes(schedule.id) &&
				(subId ? schedule.subscription === subId : true),
		);

		return { schedule };
	} catch (error: any) {
		logger.error(`Error getting schedule, ids: ${scheduleIds}`, {
			message: error.message,
		});
		return { schedule: undefined };
	}
};

export const paramsToCurSub = async ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	const { stripeCli } = attachParams;
	const curCusProduct = attachParamsToCurCusProduct({ attachParams });
	// console.log("Cur cus product:", curCusProduct);
	// console.log("Sub IDs:", curCusProduct?.subscription_ids);

	const subIds = curCusProduct?.subscription_ids || [];

	if (subIds.length === 0) {
		return undefined;
	}

	const sub = await stripeCli.subscriptions.retrieve(subIds[0], {
		expand: [
			"items.data.price.tiers",
			"latest_invoice",
			// "discounts.coupon.applies_to",
			"discounts.source.coupon",
			"discounts.source.coupon.applies_to",
		],
	});

	return sub;
};

export const paramsToCurSubSchedule = async ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	const { stripeCli } = attachParams;
	const curCusProduct = attachParamsToCurCusProduct({ attachParams });

	const subScheduleIds = curCusProduct?.scheduled_ids || [];
	if (subScheduleIds.length === 0) {
		return undefined;
	}

	const schedule = await stripeCli.subscriptionSchedules.retrieve(
		subScheduleIds[0],
		{
			expand: ["phases.items.price"],
		},
	);

	if (schedule.status === "canceled") {
		return undefined;
	}

	return schedule as Stripe.SubscriptionSchedule;
};
