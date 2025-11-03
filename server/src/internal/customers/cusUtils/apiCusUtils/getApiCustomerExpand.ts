import {
	ApiBaseEntitySchema,
	type ApiCustomerExpand,
	CusExpand,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { invoicesToResponse } from "@/internal/invoices/invoiceUtils.js";
import { CusService } from "../../CusService.js";
import { getCusPaymentMethodRes } from "../cusResponseUtils/getCusPaymentMethodRes.js";
import { getCusReferrals } from "../cusResponseUtils/getCusReferrals.js";
import { getCusRewards } from "../cusResponseUtils/getCusRewards.js";
import { getCusUpcomingInvoice } from "../cusResponseUtils/getCusUpcomingInvoice.js";

export const getApiCustomerExpand = async ({
	ctx,
	customerId,
	fullCus,
	expand,
}: {
	ctx: AutumnContext;
	customerId?: string;
	fullCus?: FullCustomer;
	expand: CusExpand[];
}): Promise<ApiCustomerExpand> => {
	const { org, env, db, logger } = ctx;

	if (expand.length === 0) return {};

	if (!fullCus) {
		fullCus = await CusService.getFull({
			db,
			idOrInternalId: customerId || "",
			orgId: org.id,
			env,
			expand,
		});
	}

	const getCusTrialsUsed = () => {
		if (expand.includes(CusExpand.TrialsUsed)) {
			return fullCus.trials_used;
		}
		return undefined;
	};

	const getApiCusEntities = () => {
		if (expand.includes(CusExpand.Entities)) {
			return fullCus.entities.map((e) => ApiBaseEntitySchema.parse(e));
		}
		return undefined;
	};

	const invoices = expand.includes(CusExpand.Invoices)
		? invoicesToResponse({
				invoices: fullCus.invoices || [],
				logger,
			})
		: undefined;

	const [rewards, upcomingInvoice, referrals, paymentMethod] =
		await Promise.all([
			getCusRewards({
				org,
				env,
				fullCus,
				subIds: fullCus.customer_products.flatMap(
					(cp: FullCusProduct) => cp.subscription_ids || [],
				),
				expand,
			}),
			getCusUpcomingInvoice({
				db,
				org,
				env,
				fullCus,
				expand,
			}),
			getCusReferrals({
				db,
				fullCus,
				expand,
			}),
			getCusPaymentMethodRes({
				org,
				env,
				fullCus,
				expand,
			}),
		]);

	return {
		trials_used: getCusTrialsUsed(),
		entities: getApiCusEntities(),
		rewards,
		upcoming_invoice: upcomingInvoice,
		referrals,
		payment_method: paymentMethod,
		invoices,
	};
};
