import {
	type AttachConfig,
	AttachScenario,
	ErrCode,
	SuccessCode,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { subItemInCusProduct } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import {
	type AttachParams,
	AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { addSubIdToCache } from "../../cusCache/subCacheUtils.js";
import {
	cusProductToSchedule,
	cusProductToSub,
} from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import {
	attachParamsToCurCusProduct,
	attachParamToCusProducts,
	getSubForAttach,
	paramsToCurSub,
} from "../attachUtils/convertAttachParams.js";
import { paramsToScheduleItems } from "../mergeUtils/paramsToScheduleItems.js";
import { subToNewSchedule } from "../mergeUtils/subToNewSchedule.js";
import { updateCurSchedule } from "../mergeUtils/updateCurSchedule.js";

export const handleRenewProduct = async ({
	req,
	res,
	attachParams,
	config,
}: {
	req: any;
	res: any;
	attachParams: AttachParams;
	config: AttachConfig;
}) => {
	const logger = req.logger;
	const { stripeCli } = attachParams;
	let { curScheduledProduct } = attachParamToCusProducts({ attachParams });

	const curCusProduct = attachParamsToCurCusProduct({ attachParams });
	const product = attachParams.products[0];
	const cusProducts = attachParams.customer.customer_products;
	const curSubId = curCusProduct?.subscription_ids?.[0];

	if (!curCusProduct) {
		throw new RecaseError({
			message: `RENEW FLOW, curCusProduct is undefined`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (curCusProduct.product.is_add_on) {
		curScheduledProduct = undefined;
	}

	const schedule = await cusProductToSchedule({
		cusProduct: curCusProduct,
		stripeCli,
	});

	const otherCanceled = cusProducts.some(
		(cp) =>
			cp.subscription_ids?.includes(curSubId || "") &&
			cp.canceled &&
			cp.id !== curCusProduct?.id,
	);

	let expectedEnd: number | undefined;
	if (curSubId) {
		const curSub = await getSubForAttach({
			stripeCli,
			subId: curSubId,
		});
		const subItems = curSub?.items.data.filter((item) =>
			subItemInCusProduct({ cusProduct: curCusProduct, subItem: item }),
		);
		expectedEnd = getLatestPeriodEnd({ subItems });
	}

	if (!otherCanceled) {
		if (schedule) {
			logger.info(`RENEW FLOW: releasing schedule ${schedule.id}`);
			await stripeCli.subscriptionSchedules.release(schedule.id);

			await CusProductService.updateByStripeScheduledId({
				db: req.db,
				stripeScheduledId: schedule.id,
				updates: {
					scheduled_ids: [],
				},
			});
		}

		if (curSubId) {
			// Add sub ID to upstash so webhook handler doesn't handle again
			await addSubIdToCache({
				subId: curSubId,
				scenario: AttachScenario.Renew,
			});

			// Uncancel the sub
			await stripeCli.subscriptions.update(curSubId, {
				cancel_at: null,
			});
		}

		await CusProductService.update({
			db: req.db,
			cusProductId: curCusProduct.id,
			updates: {
				canceled: false,
				canceled_at: null,
				ended_at: null,
			},
		});
	} else {
		// Remove scheduled product ONLY if product is not an add on
		const scheduledProduct = curScheduledProduct;

		// Case 1: Add current cus product back to schedule and remove scheduled product from schedule
		if (schedule) {
			logger.info(
				`RENEW FLOW: adding cur cus product back to schedule ${schedule.id}`,
			);
			const newItems = await paramsToScheduleItems({
				req,
				attachParams,
				config,
				schedule,
				removeCusProducts: scheduledProduct ? [scheduledProduct] : [],
				billingPeriodEnd: expectedEnd,
			});

			if (newItems.phases.length > 1) {
				const curSub = (await paramsToCurSub({
					attachParams,
				})) as Stripe.Subscription;

				await updateCurSchedule({
					req,
					attachParams,
					schedule,
					newPhases: newItems.phases,
					sub: curSub,
				});

				await CusProductService.update({
					db: req.db,
					cusProductId: curCusProduct.id,
					updates: {
						scheduled_ids: [schedule.id],
						canceled: false,
						canceled_at: null,
						ended_at: null,
					},
				});
			} else {
				logger.info(
					`RENEW FLOW: no new schedule items, releasing schedule ${schedule.id}`,
				);
				await stripeCli.subscriptionSchedules.release(schedule.id);

				await CusProductService.updateByStripeScheduledId({
					db: req.db,
					stripeScheduledId: schedule.id,
					updates: {
						scheduled_ids: [],
					},
				});

				await CusProductService.update({
					db: req.db,
					cusProductId: curCusProduct.id,
					updates: {
						canceled: false,
						canceled_at: null,
						ended_at: null,
					},
				});
			}
		}
		// Case 2: Create new schedule for current cus product
		// Example scenario: Premium 1, Premium 2, Free 1, Free 2, Premium 1
		else {
			logger.info(`RENEW FLOW: creating new schedule`);
			const curSub = (await cusProductToSub({
				cusProduct: curCusProduct,
				stripeCli,
			})) as Stripe.Subscription;

			const periodEnd = getLatestPeriodEnd({ sub: curSub });
			await subToNewSchedule({
				req,
				sub: curSub,
				attachParams,
				config,
				endOfBillingPeriod: periodEnd,
			});

			await CusProductService.update({
				db: req.db,
				cusProductId: curCusProduct.id,
				updates: {
					canceled: false,
					canceled_at: null,
					ended_at: null,
				},
			});
		}
	}

	if (curCusProduct) {
		try {
			await addProductsUpdatedWebhookTask({
				req,
				internalCustomerId: curCusProduct.internal_customer_id,
				org: attachParams.org,
				env: attachParams.customer.env,
				customerId:
					attachParams.customer.id || attachParams.customer.internal_id,
				scenario: AttachScenario.Renew,
				cusProduct: curCusProduct,
				logger,
			});
		} catch (error) {
			logger.error("RENEW FLOW: failed to add to webhook queue", { error });
		}
	}

	if (curScheduledProduct) {
		await CusProductService.delete({
			db: req.db,
			cusProductId: curScheduledProduct.id,
		});
	}

	if (res) {
		res.status(200).json(
			AttachResultSchema.parse({
				code: SuccessCode.RenewedProduct,
				message: `Successfully renewed product ${product.name}`,
				product_ids: [product.id],
				customer_id:
					attachParams.customer.id || attachParams.customer.internal_id,
			}),
		);
	}
};
