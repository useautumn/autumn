import {
	ApiBaseEntitySchema,
	type ApiCusExpand,
	CusExpand,
	type FullCusProduct,
	type FullCustomer,
	filterExpand,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { invoicesToResponse } from "@/internal/invoices/invoiceUtils.js";
import { InvoiceService } from "../../../invoices/InvoiceService.js";
import { CusService } from "../../CusService.js";
import { getCusPaymentMethodRes } from "../cusResponseUtils/getCusPaymentMethodRes.js";
import { getCusReferrals } from "../cusResponseUtils/getCusReferrals.js";
import { getCusRewards } from "../cusResponseUtils/getCusRewards.js";
import { getCusUpcomingInvoice } from "../cusResponseUtils/getCusUpcomingInvoice.js";

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
		filter: [CusExpand.BalancesFeature, CusExpand.SubscriptionsPlan],
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

	const getInvoices = async () => {
		if (!expand.includes(CusExpand.Invoices)) {
			return undefined;
		}

		const invoices = await InvoiceService.list({
			db,
			internalCustomerId: fullCus.internal_id,
			internalEntityId: fullCus.entity?.internal_id,
		});

		return invoicesToResponse({
			invoices,
			logger,
		});
	};

	const cusExpand = expand as CusExpand[];

	const [rewards, upcomingInvoice, referrals, paymentMethod, invoices] =
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
			getCusUpcomingInvoice({
				db,
				org,
				env,
				fullCus,
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
			getInvoices(),
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
