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
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	getLatestPeriodEnd,
	subToPeriodStartEnd,
} from "../../stripeSubUtils/convertSubUtils.js";

export const isSubCanceled = ({
	previousAttributes,
	sub,
}: {
	previousAttributes: unknown;
	sub: Stripe.Subscription;
}) => {
	const prevAttrs = previousAttributes as Record<string, unknown>;

	if (!sub.cancel_at && !sub.cancel_at_period_end) {
		return {
			canceled: false,
			canceledAt: null,
		};
	}
	const cancelAtPreviousEnd =
		!prevAttrs.cancel_at_period_end && sub.cancel_at_period_end;

	const cancelAt = nullish(prevAttrs.cancel_at) && sub.cancel_at;
	const canceledAt = nullish(prevAttrs.canceled_at) && sub.canceled_at;

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
	logger: { info: (msg: string) => void };
}) => {
	// 1. Check if sub has schedule
	if (sub.schedule) {
		return;
	}

	logger.info(
		`sub.updated: updating cus products to canceled, stripeSubId=${sub.id}, canceledAt=${canceledAt}`,
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
	ctx,
	previousAttributes,
	org,
	sub,
	updatedCusProducts,
}: {
	ctx: AutumnContext;
	previousAttributes: unknown;
	sub: Stripe.Subscription;
	org: Organization;
	updatedCusProducts: FullCusProduct[];
}) => {
	const { canceled, canceledAt } = isSubCanceled({
		previousAttributes,
		sub,
	});

	const isAutumnDowngrade =
		sub.cancellation_details?.comment?.includes("autumn_downgrade") ||
		sub.cancellation_details?.comment?.includes("autumn_cancel");

	const { db, env, logger } = ctx;

	if (!canceled) return;

	if (isAutumnDowngrade) {
		logger.info(`sub.canceled SKIP: isAutumnDowngrade`);
		return;
	}

	if (updatedCusProducts.length === 0) {
		logger.info(`sub.canceled SKIP: canceled but no updatedCusProducts`);
		return;
	}

	await updateCusProductCanceled({
		db,
		sub,
		canceledAt,
		logger,
	});

	if (!org.config.sync_status) {
		logger.info(`sub.canceled SKIP webhook: org.config.sync_status=false`);
		return;
	}

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
			ctx,
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
				ctx,
				internalCustomerId: cusProd.internal_customer_id,
				org,
				env,
				customerId: null,
				scenario: AttachScenario.Cancel,
				cusProduct: cusProd,
				scheduledCusProduct: scheduledCusProducts.find(
					(cp) => cp.product.group === cusProd.product.group,
				),
			});
			logger.info(`sub.canceled ✅ SENT webhook for ${cusProd.product.name}`);
		} catch (error) {
			logger.error(
				`sub.canceled ❌ FAILED webhook for ${cusProd.product.name}`,
				error,
			);
		}
	}
};
