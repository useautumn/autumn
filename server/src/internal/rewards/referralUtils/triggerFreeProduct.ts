import {
  type AppEnv,
  type Customer,
  ErrCode,
  type FullRewardProgram,
  type ReferralCode,
  type Reward,
  RewardReceivedBy,
  type RewardRedemption,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCusCache } from "@/internal/customers/cusCache/updateCachedCus.js";
import type { InsertCusProductParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { RewardRedemptionService } from "../RewardRedemptionService.js";
import { ReferralResponseCodes } from "../referralUtils.js";
import { triggerFreePaidProduct } from "./triggerFreePaidProduct.js";

export const triggerFreeProduct = async ({
	req,
	db,
	referralCode,
	redeemer,
	redemption,
	rewardProgram,
	org,
	env,
	logger,
}: {
	req?: ExtendedRequest;
	db: DrizzleCli;
	referralCode: ReferralCode;
	redeemer: Customer;
	redemption: RewardRedemption;
	rewardProgram: FullRewardProgram & { reward: Reward };
	org: any;
	env: AppEnv;
	logger: any;
}) => {
	logger.info(`Triggering free product reward`);
	const { received_by } = rewardProgram;

	const addToRedeemer = received_by === RewardReceivedBy.All;
	const addToReferrer =
		received_by === RewardReceivedBy.Referrer ||
		received_by === RewardReceivedBy.All;

	const productId = rewardProgram.reward.free_product_id!;

	const fullProduct = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});

	function seedReq(req?: ExtendedRequest) {
		// Seed in properties that aren't usually present dependent on the trigger type
		return {
			...(req || {}),
			db: req?.db ? req.db : db,
			org: req?.org ? req.org : org,
			env: req?.env ? req.env : env,
			logger: req?.logger ? req.logger : logger,
			logtail: req?.logtail ? req.logtail : logger,
		} as ExtendedRequest;
	}

	if (!isFreeProduct(fullProduct.prices) && !isOneOff(fullProduct.prices)) {
		req = seedReq(req);
		return await triggerFreePaidProduct({
			req,
			referralCode,
			redeemer,
			rewardProgram,
			fullProduct,
			redemption,
		});
	}

	// const isPaidProduct = !isFreeProduct(fullProduct.prices);
	// const isRecurring =
	//   !isOneOff(fullProduct.prices) && !itemsAreOneOff(fullProduct.entitlements);

	if (!fullProduct) {
		throw new RecaseError({
			message: `Product ${productId} not found`,
			code: ErrCode.ProductNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	const [fullReferrer, fullRedeemer] = await Promise.all([
		CusService.getFull({
			db,
			idOrInternalId: referralCode.internal_customer_id,
			orgId: org.id,
			env,
			allowNotFound: true,
		}),
		CusService.getFull({
			db,
			idOrInternalId: redeemer.id!,
			orgId: org.id,
			env,
		}),
	]);

	if (!fullReferrer) {
		throw new RecaseError({
			message: `Referrer (internal ID: ${referralCode.internal_customer_id}) not found`,
			code: ErrCode.CustomerNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	const attachParams: InsertCusProductParams = {
		req,
		org,
		product: fullProduct,
		prices: fullProduct.prices,
		entitlements: fullProduct.entitlements,
		optionsList: [],
		entities: [],
		freeTrial: null,
		features: [],
		customer: fullReferrer,
		cusProducts: fullReferrer.customer_products,
		replaceables: [],
	};

	if (addToRedeemer) {
		const redeemerAttachParams = {
			...structuredClone(attachParams),
			customer: fullRedeemer,
			cusProducts: fullRedeemer.customer_products,
		};

		await createFullCusProduct({
			db,
			attachParams: redeemerAttachParams,
			logger,
		});
		logger.info(`✅ Added ${fullProduct.name} to redeemer`);

		await deleteCusCache({
			db,
			customerId: fullRedeemer.id!,
			org,
			env,
		});
	}

	if (addToReferrer) {
		await createFullCusProduct({
			db,
			attachParams: {
				...structuredClone(attachParams),
				customer: fullReferrer,
				cusProducts: fullReferrer.customer_products,
			},
			logger,
		});
		await deleteCusCache({
			db,
			customerId: fullReferrer.id!,
			org,
			env,
		});
		logger.info(`✅ Added ${fullProduct.name} to referrer`);
	}

	await RewardRedemptionService.update({
		db,
		id: redemption.id,
		updates: {
			triggered: true,
			applied: true,
		},
	});

	return {
		redeemer: {
			applied: addToRedeemer,
			cause: addToRedeemer
				? ReferralResponseCodes.Success
				: ReferralResponseCodes.OwnsProduct,
			meta: {
				id: fullRedeemer.id,
				name: fullRedeemer.name,
				email: fullRedeemer.email,
				created_at: fullRedeemer.created_at,
			},
		},
		referrer: {
			applied: addToReferrer,
			cause: addToReferrer
				? ReferralResponseCodes.Success
				: ReferralResponseCodes.OwnsProduct,
		},
	};
};
