import { type AttachBody, ErrCode } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import RecaseError from "@/utils/errorUtils.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import { getCustomerAndProducts } from "./attachParamsUtils/getCusAndProducts.js";
import { getPricesAndEnts } from "./attachParamsUtils/getPricesAndEnts.js";
import { getStripeCusData } from "./attachParamsUtils/getStripeCusData.js";

export const getRewards = async ({
	ctx,
	attachBody,
	stripeCli,
}: {
	ctx: AutumnContext;
	attachBody: AttachBody;
	stripeCli: Stripe;
}) => {
	const { reward: idOrCode } = attachBody;

	if (!idOrCode) {
		return undefined;
	}

	const rewardArray = typeof idOrCode === "string" ? [idOrCode] : idOrCode;

	if (rewardArray.length === 0) {
		return undefined;
	}

	// 1. Get reward by id or promo code
	const rewards = await RewardService.getByIdOrCode({
		db: ctx.db,
		codes: rewardArray,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	for (const reward of rewardArray) {
		const corresponding = rewards.find(
			(r) => r.id === reward || r.promo_codes.some((c) => c.code === reward),
		);

		if (!corresponding) {
			throw new RecaseError({
				message: `Reward ${reward} not found`,
				code: ErrCode.RewardNotFound,
				statusCode: 404,
			});
		}
	}

	return rewards;

	// const stripeCoupon = await stripeCli.coupons.retrieve(reward.id);

	// return {
	//   reward,
	//   stripeCoupon,
	// };
};

export const processAttachBody = async ({
	ctx,
	attachBody,
}: {
	ctx: AutumnContext;
	attachBody: AttachBody;
}) => {
	// 1. Get customer and products
	const { org, env, logger } = ctx;

	const stripeCli = createStripeCli({ org, env });

	const { customer, products } = await getCustomerAndProducts({
		ctx,
		attachBody,
	});

	const [stripeCusData, rewardData] = await Promise.all([
		getStripeCusData({
			stripeCli,
			db: ctx.db,
			org,
			env,
			customer,
			logger,
		}),
		getRewards({
			ctx,
			attachBody,
			stripeCli,
		}),
	]);

	const { stripeCus, paymentMethod, now } = stripeCusData;

	const {
		optionsList,
		prices,
		entitlements,
		freeTrial,
		customPrices,
		customEnts,
	} = await getPricesAndEnts({
		ctx,
		attachBody,
		customer,
		products,
	});

	return {
		customer,
		products,
		rewards: rewardData,
		optionsList,
		prices,
		entitlements,
		freeTrial,
		customPrices,
		customEnts,

		// Additional data
		stripeVars: {
			stripeCli,
			stripeCus,
			paymentMethod,
			now,
		},
	};
};
