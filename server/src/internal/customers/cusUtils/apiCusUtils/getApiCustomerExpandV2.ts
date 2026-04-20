import {
	ApiBaseEntitySchema,
	type ApiCusExpand,
	CustomerExpand,
	type FullCusProduct,
	type FullSubject,
	filterExpand,
	fullSubjectToFullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { getCusPaymentMethodRes } from "../cusResponseUtils/getCusPaymentMethodRes.js";
import { getCusReferrals } from "../cusResponseUtils/getCusReferrals.js";
import { getCusRewards } from "../cusResponseUtils/getCusRewards.js";
import { getCusTrialsUsed } from "../cusResponseUtils/getCusTrialsUsed.js";

/**
 * Build expand fields directly from a FullSubject — no extra FullCustomer fetch.
 * For entities, queries the DB directly (capped at 1000).
 */
export const getApiCustomerExpandV2 = async ({
	ctx,
	fullSubject,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
}): Promise<ApiCusExpand> => {
	const { expand } = ctx;

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

	const cusExpand = expand as CustomerExpand[];
	const fullCus = fullSubjectToFullCustomer({ fullSubject });

	const subIds = fullSubject.customer_products.flatMap(
		(cp: FullCusProduct) => cp.subscription_ids || [],
	);

	const getApiEntities = async () => {
		if (!cusExpand.includes(CustomerExpand.Entities)) return undefined;

		const entities = await EntityService.list({
			db: ctx.db,
			internalCustomerId: fullCus.internal_id,
		});

		return entities.map((e) =>
			ApiBaseEntitySchema.parse({
				...e,
				customer_id: fullSubject.customer.id,
			}),
		);
	};

	const [entities, rewards, referrals, paymentMethod, trialsUsed] =
		await Promise.all([
			getApiEntities(),
			getCusRewards({
				org: ctx.org,
				env: ctx.env,
				fullCus,
				subIds,
				expand: cusExpand,
			}),
			getCusReferrals({
				db: ctx.db,
				fullCus,
				expand: cusExpand,
			}),
			getCusPaymentMethodRes({
				org: ctx.org,
				env: ctx.env,
				fullCus,
				expand: cusExpand,
			}),
			getCusTrialsUsed({
				ctx,
				fullCus,
				expand: cusExpand,
			}),
		]);

	return {
		trials_used: trialsUsed ?? undefined,
		entities: entities ?? undefined,
		rewards: rewards ?? undefined,
		referrals: referrals ?? undefined,
		payment_method: paymentMethod ?? undefined,
	};
};
