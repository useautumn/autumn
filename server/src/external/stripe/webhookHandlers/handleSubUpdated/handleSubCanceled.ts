import {
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	type Organization,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { productToInsertParams } from "@/internal/customers/attach/attachUtils/attachParams/convertToParams.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { formatUnixToDateTime, nullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import {
	getLatestPeriodEnd,
	subToPeriodStartEnd,
} from "../../stripeSubUtils/convertSubUtils.js";

export const isSubCanceled = ({
	previousAttributes,
	sub,
}: {
	previousAttributes: any;
	sub: Stripe.Subscription;
}) => {
	// console.log("Previous attributes:", previousAttributes);
	// console.log("Cancel at:", sub.cancel_at);
	// console.log("Cancel at period end:", sub.cancel_at_period_end);
	// console.log("Canceled at:", sub.canceled_at);

	if (!sub.cancel_at && !sub.cancel_at_period_end) {
		return {
			canceled: false,
			canceledAt: null,
		};
	}
	const cancelAtPreviousEnd =
		!previousAttributes.cancel_at_period_end && sub.cancel_at_period_end;

	const cancelAt = nullish(previousAttributes.cancel_at) && sub.cancel_at;
	const canceledAt = nullish(previousAttributes.canceled_at) && sub.canceled_at;

	return {
		canceled: cancelAtPreviousEnd || cancelAt || canceledAt,
		canceledAt: sub.canceled_at ? sub.canceled_at * 1000 : Date.now(),
	};
};

const updateCusProductCanceled = async ({
	db,
	sub,
	canceledAt,
	logger,
}: {
	db: DrizzleCli;
	sub: Stripe.Subscription;
	canceledAt?: number | null;
	logger: any;
}) => {
	// 1. Check if sub has schedule
	if (sub.schedule) {
		return;
	}

	logger.info(
		`Updating cus products for sub ${sub.id} to canceled | canceled_at: ${canceledAt}`,
	);

	const cancelsAt = sub.cancel_at ? sub.cancel_at * 1000 : undefined;

	await CusProductService.updateByStripeSubId({
		db,
		stripeSubId: sub.id,
		updates: {
			canceled_at: canceledAt || Date.now(),
			canceled: true,
			ended_at: cancelsAt,
		},
	});
};

export const handleSubCanceled = async ({
	req,
	previousAttributes,
	org,
	sub,
	updatedCusProducts,
}: {
	req: ExtendedRequest;
	previousAttributes: any;
	sub: Stripe.Subscription;
	org: Organization;
	updatedCusProducts: FullCusProduct[];
}) => {
	// let isCanceled =
	//   nullish(previousAttributes?.canceled_at) && !nullish(sub.canceled_at);
	const { canceled, canceledAt } = isSubCanceled({
		previousAttributes,
		sub,
	});

	const isAutumnDowngrade =
		sub.cancellation_details?.comment?.includes("autumn_downgrade") ||
		sub.cancellation_details?.comment?.includes("autumn_cancel");

	const canceledFromPortal = canceled && !isAutumnDowngrade;

	const { db, env, logger } = req;

	if (!canceledFromPortal || updatedCusProducts.length === 0) return;

	await updateCusProductCanceled({
		db,
		sub,
		canceledAt,
		logger,
	});

	if (!org.config.sync_status) return;

	const allDefaultProducts = await ProductService.listDefault({
		db,
		orgId: org.id,
		env,
	});

	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: updatedCusProducts[0].customer!.id!,
		orgId: org.id,
		env,
		withEntities: true,
		inStatuses: [CusProductStatus.Scheduled],
	});

	const cusProducts = fullCus.customer_products;
	const entities = fullCus.entities;

	const defaultProducts = allDefaultProducts.filter((p) =>
		updatedCusProducts.some(
			(cp: FullCusProduct) =>
				cp.product.group === p.group && nullish(cp.internal_entity_id),
		),
	);

	if (defaultProducts.length === 0) return;

	if (defaultProducts.length > 0) {
		const { end } = subToPeriodStartEnd({ sub });
		const productNames = defaultProducts.map((p) => p.name).join(", ");
		const periodEnd = formatUnixToDateTime(end * 1000);
		logger.info(
			`subscription.updated: canceled -> attempting to schedule default products: ${productNames}, period end: ${periodEnd}`,
		);
	}

	const scheduledCusProducts: FullCusProduct[] = [];
	for (const product of defaultProducts) {
		const alreadyScheduled = cusProducts.some(
			(cp: FullCusProduct) => cp.product.group === product.group,
		);

		if (alreadyScheduled) {
			continue;
		}

		const insertParams = productToInsertParams({
			req,
			fullCus,
			newProduct: product,
			entities,
		});

		const end = getLatestPeriodEnd({ sub });
		const fullCusProduct = await createFullCusProduct({
			db,
			attachParams: insertParams,
			startsAt: end * 1000,
			sendWebhook: false,
			logger,
		});

		if (fullCusProduct) {
			scheduledCusProducts.push(fullCusProduct);
		}
	}

	for (const cusProd of updatedCusProducts) {
		try {
			await addProductsUpdatedWebhookTask({
				req,
				internalCustomerId: cusProd.internal_customer_id,
				org,
				env,
				customerId: null,
				logger,
				scenario: AttachScenario.Cancel,
				cusProduct: cusProd,
				scheduledCusProduct: scheduledCusProducts.find(
					(cp) => cp.product.group === cusProd.product.group,
				),
			});
		} catch (error) {
			logger.error("Failed to add products updated webhook task to queue", {
				error,
			});
		}
	}
};
