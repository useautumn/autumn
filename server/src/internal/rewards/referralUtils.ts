import {
	type AppEnv,
	AttachBranch,
	type Customer,
	ErrCode,
	type FullRewardProgram,
	type ReferralCode,
	type Reward,
	RewardReceivedBy,
	type RewardRedemption,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import RecaseError from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { createCusInStripe } from "@/utils/scriptUtils/initCustomer.js";
import { createFullCusProduct } from "../customers/add-product/createFullCusProduct.js";
import { handleAddProduct } from "../customers/attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { rewardProgramToAttachParams } from "../customers/attach/attachUtils/attachParams/convertToParams.js";
import { CusService } from "../customers/CusService.js";
import { deleteCusCache } from "../customers/cusCache/updateCachedCus.js";
import type { InsertCusProductParams } from "../customers/cusProducts/AttachParams.js";
import { ProductService } from "../products/ProductService.js";
import {
	isFreeProduct,
	isOneOff,
	itemsAreOneOff,
} from "../products/productUtils.js";
import { RewardRedemptionService } from "./RewardRedemptionService.js";

export const ReferralResponseCodes = {
	OwnsProduct: "has_product_already",
	Success: "success",
	Unknown: "unknown",
	NotConfigured: "not_configured",
	InternalError: "internal_error",
};

export const generateReferralCode = () => {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const codeLength = 6;

	let code = "";

	for (let i = 0; i < codeLength; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length));
	}

	return code;
};

// Trigger reward
export const triggerRedemption = async ({
	db,
	referralCode,
	org,
	env,
	logger,
	reward,
	redemption,
}: {
	db: DrizzleCli;
	org: any;
	env: AppEnv;
	logger: any;
	referralCode: ReferralCode;
	reward: Reward;
	redemption: RewardRedemption;
}) => {
	logger.info(
		`Triggering redemption ${redemption.id} for referral code ${referralCode.code}`,
	);

	const applyToCustomer = await CusService.getByInternalId({
		db,
		internalId: referralCode.internal_customer_id,
	});

	if (!applyToCustomer) {
		throw new RecaseError({
			message: `Customer ${referralCode.internal_customer_id} not found`,
			code: ErrCode.CustomerNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	const stripeCli = createStripeCli({
		org,
		env,
		legacyVersion: true,
	});

	await createStripeCusIfNotExists({
		db,
		customer: applyToCustomer,
		org,
		env,
		logger,
	});

	const stripeCusId = applyToCustomer.processor.id;
	const stripeCus = (await stripeCli.customers.retrieve(
		stripeCusId,
	)) as Stripe.Customer;

	let applied = false;
	if (!stripeCus.discount) {
		await stripeCli.customers.update(stripeCusId, {
			// @ts-expect-error
			coupon: reward.id,
		});

		applied = true;
		logger.info(`Applied coupon to customer in Stripe`);
	}

	const updatedRedemption = await RewardRedemptionService.update({
		db,
		id: redemption.id,
		updates: {
			applied,
			triggered: true,
		},
	});

	logger.info(`Successfully triggered redemption, applied: ${applied}`);

	return updatedRedemption;
};

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

	let addToRedeemer = received_by === RewardReceivedBy.All;
	let addToReferrer =
		received_by === RewardReceivedBy.Referrer ||
		received_by === RewardReceivedBy.All;

	const productId = rewardProgram.reward.free_product_id!;

	const fullProduct = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId: org.id,
		env,
	});

	const isPaidProduct = !isFreeProduct(fullProduct.prices);
	const isRecurring =
		!isOneOff(fullProduct.prices) && !itemsAreOneOff(fullProduct.entitlements);

	if (!fullProduct) {
		throw new RecaseError({
			message: `Product ${productId} not found`,
			code: ErrCode.ProductNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	const referrer = await CusService.getByInternalId({
		db,
		internalId: referralCode.internal_customer_id,
	});

	if (!referrer) {
		throw new RecaseError({
			message: `Referrer ${referralCode.internal_customer_id} not found`,
			code: ErrCode.CustomerNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	const [fullReferrer, fullRedeemer] = await Promise.all([
		CusService.getFull({
			db,
			idOrInternalId: referrer.id!,
			orgId: org.id,
			env,
		}),
		CusService.getFull({
			db,
			idOrInternalId: redeemer.id!,
			orgId: org.id,
			env,
		}),
	]);

	if (fullReferrer.customer_products.find((cp) => cp.product.id === productId))
		addToReferrer = false;

	if (fullRedeemer.customer_products.find((cp) => cp.product.id === productId))
		addToRedeemer = false;

	function seedReq(req: ExtendedRequest) {
		// Seed in properties that aren't usually present dependent on the trigger type
		return {
			...req,
			db: req?.db ? req.db : db,
			org: req?.org ? req.org : org,
			env: req?.env ? req.env : env,
			logger: req?.logger ? req.logger : logger,
			logtail: req?.logtail ? req.logtail : logger,
		} as ExtendedRequest;
	}

	// Branch 1: Free add-on product or non-recurring product
	if (!isPaidProduct || !isRecurring) {
		logger.info(`Branch 1: ${isPaidProduct ? "Paid" : "Free"} add-on product`);
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
	}
	// Branch 2: Paid product from Customer Redemption Or Checkout
	else if (isPaidProduct) {
		logger.info(`Branch 2: Paid product from Customer Redemption`);
		if (!req) {
			req = {
				db,
				org,
				env,
				logger,
				logtail: logger,
			} as ExtendedRequest;
		}
		req = seedReq(req);

		const ensureStripeIDs = [
			!fullRedeemer.processor?.id &&
				(await createCusInStripe({
					customer: fullRedeemer,
					org,
					env,
					db,
					testClockId: req?.body?.testClockId || undefined,
				})),
			!fullReferrer.processor?.id &&
				(await createCusInStripe({
					customer: fullReferrer,
					org,
					env,
					db,
					testClockId: req?.body?.testClockId || undefined,
				})),
		];

		// Update customers with new Stripe IDs if they were created
		const updatedIDs = await Promise.all(ensureStripeIDs);
		if (updatedIDs[0]) fullRedeemer.processor.id = updatedIDs[0].id;
		if (updatedIDs[1]) fullReferrer.processor.id = updatedIDs[1].id;

		const executions = [
			addToRedeemer &&
				(await handleAddProduct({
					req,
					attachParams: rewardProgramToAttachParams({
						req,
						rewardProgram: rewardProgram,
						customer: fullRedeemer,
						product: fullProduct,
						org,
					}),
					branch: AttachBranch.New,
				})),
			addToReferrer &&
				(await handleAddProduct({
					req,
					attachParams: rewardProgramToAttachParams({
						req,
						rewardProgram: rewardProgram,
						customer: fullReferrer,
						product: fullProduct,
						org,
					}),
					branch: AttachBranch.New,
				})),
		];

		const results = await Promise.allSettled(executions);
		const redeemerCause = !addToRedeemer
			? ReferralResponseCodes.OwnsProduct
			: results[0]?.status === "fulfilled"
				? ReferralResponseCodes.Success
				: ReferralResponseCodes.InternalError;
		const referrerCause = !addToReferrer
			? ReferralResponseCodes.OwnsProduct
			: results[1]?.status === "fulfilled"
				? ReferralResponseCodes.Success
				: ReferralResponseCodes.InternalError;
		const appliedToRedeemer =
			addToRedeemer && results[0]?.status === "fulfilled";
		const appliedToReferrer =
			addToReferrer && results[1]?.status === "fulfilled";

		if (results.every((result) => result.status === "fulfilled")) {
			await RewardRedemptionService.update({
				db,
				id: redemption.id,
				updates: {
					triggered: true,
					applied: true,
				},
			});
		} else {
			logger.error(`Error in executions: ${results}`);
		}

		return {
			redeemer: {
				applied: appliedToRedeemer,
				cause: redeemerCause,
				meta: {
					id: fullRedeemer.id,
					name: fullRedeemer.name,
					email: fullRedeemer.email,
					created_at: fullRedeemer.created_at,
				},
			},
			referrer: { applied: appliedToReferrer, cause: referrerCause },
		};
	}
	// Branch 3: Paid product from Checkout
	else {
		return {
			redeemer: { applied: false, cause: ReferralResponseCodes.Unknown },
			referrer: { applied: false, cause: ReferralResponseCodes.Unknown },
		};
	}
};

// else if (!req && isPaidProduct) {
// 	logger.info(`Branch 3: Paid product from Checkout`);
// 	logger.info(`Branch 2: Paid product from Customer Redemption`);

// 	const ensureStripeIDs = [
// 		!fullRedeemer.processor?.id &&
// 			(await createCusInStripe({
// 				customer: fullRedeemer,
// 				org,
// 				env,
// 				db,
// 			})),
// 		!fullReferrer.processor?.id &&
// 			(await createCusInStripe({
// 				customer: fullReferrer,
// 				org,
// 				env,
// 				db,
// 			})),
// 	];

// 	// Update customers with new Stripe IDs if they were created
// 	const updatedIDs = await Promise.all(ensureStripeIDs);
// 	if (updatedIDs[0]) fullRedeemer.processor.id = updatedIDs[0].id;
// 	if (updatedIDs[1]) fullReferrer.processor.id = updatedIDs[1].id;

// 	const executions = [
// 		addToRedeemer &&
// 			(await handleAddProduct({
// 				req: {
// 					db,
// 					logtail: logger,
// 					logger,
// 				} as ExtendedRequest,
// 				attachParams: rewardProgramToAttachParams({
// 					req: {
// 						db,
// 						logtail: logger,
// 						logger,
// 					} as ExtendedRequest,
// 					rewardProgram: rewardProgram,
// 					customer: fullRedeemer,
// 					product: fullProduct,
// 					org,
// 				}),
// 				branch: AttachBranch.New,
// 			})),
// 		addToReferrer &&
// 			(await handleAddProduct({
// 				req: {
// 					db,
// 					logtail: logger,
// 					logger,
// 				} as ExtendedRequest,
// 				attachParams: rewardProgramToAttachParams({
// 					req: {
// 						db,
// 						logtail: logger,
// 						logger,
// 					} as ExtendedRequest,
// 					rewardProgram: rewardProgram,
// 					customer: fullReferrer,
// 					product: fullProduct,
// 					org,
// 				}),
// 				branch: AttachBranch.New,
// 			})),
// 	];

// 	await Promise.allSettled(executions)
// 		.then(async (x) => {
// 			if (x.every((y) => y.status === "fulfilled")) {
// 				await RewardRedemptionService.update({
// 					db,
// 					id: redemption.id,
// 					updates: {
// 						triggered: true,
// 						applied: true,
// 					},
// 				});
// 			} else {
// 				logger.error(`Error in executions: ${x}`);
// 			}
// 		})
// 		.catch((error) => {
// 			logger.error(`Error in executions: ${error}`);
// 			return ``;
// 		});

// 	return {
// 		redeemer: {
// 			applied: addToRedeemer,
// 			cause: "redeemerCause",
// 			meta: {
// 				id: fullRedeemer.id,
// 				name: fullRedeemer.name,
// 				email: fullRedeemer.email,
// 				created_at: fullRedeemer.created_at,
// 			},
// 		},
// 		referrer: { applied: addToReferrer, cause: "referrerCause" },
// 	};
// }
