import {
	ApiBaseEntitySchema,
	CustomerExpand,
	type FullCusProduct,
	type FullCustomer,
	filterExpand,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "../../CusService.js";
import { getCusAutoTopupPurchaseLimits } from "../cusResponseUtils/getCusAutoTopupPurchaseLimits.js";
import { getCusPaymentMethodRes } from "../cusResponseUtils/getCusPaymentMethodRes.js";
import { getCusReferrals } from "../cusResponseUtils/getCusReferrals.js";
import { getCusRewards } from "../cusResponseUtils/getCusRewards.js";
import { getCusTrialsUsed } from "../cusResponseUtils/getCusTrialsUsed.js";
import type { ApiCustomerExpandResult } from "./getApiCustomerExpandV2.js";

export const getApiCustomerExpand = async ({
	ctx,
	customerId,
	fullCus,
}: {
	ctx: AutumnContext;
	customerId?: string;
	fullCus?: FullCustomer;
}): Promise<ApiCustomerExpandResult> => {
	const { org, env, db, expand } = ctx;

	// Filter out synthetic nested expand paths handled within sub-builders.
	const filteredExpand = filterExpand({
		expand,
		filter: [
			CustomerExpand.BalancesFeature,
			CustomerExpand.FlagsFeature,
			CustomerExpand.SubscriptionsPlan,
			CustomerExpand.Invoices,
		],
	});

	if (filteredExpand.length === 0) return {};

	if (!fullCus) {
		fullCus = await CusService.getFull({
			ctx,
			idOrInternalId: customerId || "",
			expand: expand as CustomerExpand[],
			withEntities: expand.includes(CustomerExpand.Entities),
			withSubs: true,
		});
	}

	const getApiCusEntities = () => {
		if (expand.includes(CustomerExpand.Entities)) {
			return fullCus.entities.map((e) => ApiBaseEntitySchema.parse(e));
		}
		return undefined;
	};

	const cusExpand = expand as CustomerExpand[];

	const [rewards, referrals, paymentMethod, trialsUsed, autoTopupsWithLimits] =
		await Promise.all([
			getCusRewards({
				org,
				env,
				fullCus,
				subIds: fullCus.customer_products.flatMap(
					(cp: FullCusProduct) => cp.subscription_ids || [],
				),
				expand: cusExpand,
			}),
			getCusReferrals({
				db,
				fullCus,
				expand: cusExpand,
			}),
			getCusPaymentMethodRes({
				org,
				env,
				fullCus,
				expand: cusExpand,
			}),
			getCusTrialsUsed({
				ctx,
				fullCus,
				expand: cusExpand,
			}),
			getCusAutoTopupPurchaseLimits({
				ctx,
				internalCustomerId: fullCus.internal_id,
				autoTopupsConfig: fullCus.auto_topups,
				expand: cusExpand,
			}),
		]);

	return {
		trials_used: trialsUsed ?? undefined,
		entities: getApiCusEntities() ?? undefined,
		rewards: rewards ?? undefined,
		// upcoming_invoice: upcomingInvoice,
		referrals: referrals ?? undefined,
		payment_method: paymentMethod ?? undefined,
		billing_controls_override: autoTopupsWithLimits
			? { auto_topups: autoTopupsWithLimits }
			: undefined,
	};
};

// getCusUpcomingInvoice({
// 	db,
// 	org,
// 	env,
// 	fullCus,
// 	expand: cusExpand,
// }),
