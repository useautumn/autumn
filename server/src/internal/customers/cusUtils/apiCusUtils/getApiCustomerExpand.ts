import {
	ApiBaseEntitySchema,
	type ApiCusExpand,
	CusExpand,
	type FullCusProduct,
	type FullCustomer,
	filterExpand,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "../../CusService.js";
import { getCusPaymentMethodRes } from "../cusResponseUtils/getCusPaymentMethodRes.js";
import { getCusReferrals } from "../cusResponseUtils/getCusReferrals.js";
import { getCusRewards } from "../cusResponseUtils/getCusRewards.js";

export const getApiCustomerExpand = async ({
	ctx,
	customerId,
	fullCus,
}: {
	ctx: AutumnContext;
	customerId?: string;
	fullCus?: FullCustomer;
}): Promise<ApiCusExpand> => {
	const { org, env, db, logger, expand } = ctx;

	// Filter out balances.feature and subscriptions.plan
	const filteredExpand = filterExpand({
		expand,
		filter: [
			CusExpand.BalancesFeature,
			CusExpand.SubscriptionsPlan,
			CusExpand.ScheduledSubscriptionsPlan,
			CusExpand.Invoices,
		],
	});

	if (filteredExpand.length === 0) return {};

	if (!fullCus) {
		fullCus = await CusService.getFull({
			db,
			idOrInternalId: customerId || "",
			orgId: org.id,
			env,
			expand: expand as CusExpand[],
			withEntities: expand.includes(CusExpand.Entities),
			withSubs: true,
		});
	}

	const getCusTrialsUsed = () => {
		if (expand.includes(CusExpand.TrialsUsed)) {
			return (
				fullCus.trials_used?.map((t) => ({
					plan_id: t.product_id,
					customer_id: t.customer_id,
					fingerprint: t.fingerprint,
				})) ?? []
			);
		}
		return undefined;
	};

	const getApiCusEntities = () => {
		if (expand.includes(CusExpand.Entities)) {
			return fullCus.entities.map((e) => ApiBaseEntitySchema.parse(e));
		}
		return undefined;
	};

	const cusExpand = expand as CusExpand[];

	const [rewards, referrals, paymentMethod] = await Promise.all([
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
	]);

	return {
		trials_used: getCusTrialsUsed() ?? undefined,
		entities: getApiCusEntities() ?? undefined,
		rewards: rewards ?? undefined,
		// upcoming_invoice: upcomingInvoice,
		referrals: referrals ?? undefined,
		payment_method: paymentMethod ?? undefined,
	};
};

// getCusUpcomingInvoice({
// 	db,
// 	org,
// 	env,
// 	fullCus,
// 	expand: cusExpand,
// }),
