import {
	ApiCusFeatureV2Schema,
	ApiCustomerSchema,
	type AppEnv,
	CusExpand,
	CusProductStatus,
	CustomerResponseSchema,
	cusProductsToCusEnts,
	cusProductsToCusPrices,
	EntityResponseSchema,
	type Feature,
	FeatureType,
	type FullCusProduct,
	type FullCustomer,
	LegacyVersion,
	type Organization,
	type RewardResponse,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { invoicesToResponse } from "@/internal/invoices/invoiceUtils.js";
import { BREAK_API_VERSION } from "@/utils/constants.js";
import { orgToVersion } from "@/utils/versionUtils/legacyVersionUtils.js";
import { featuresToObject } from "./cusFeatureResponseUtils/balancesToFeatureResponse.js";
import { getCusBalances } from "./cusFeatureResponseUtils/getCusBalances.js";
import { processFullCusProducts } from "./cusProductResponseUtils/processFullCusProducts.js";
import { getCusPaymentMethodRes } from "./cusResponseUtils/getCusPaymentMethodRes.js";
import { getCusReferrals } from "./cusResponseUtils/getCusReferrals.js";
import { getCusRewards } from "./cusResponseUtils/getCusRewards.js";
import { getCusUpcomingInvoice } from "./cusResponseUtils/getCusUpcomingInvoice.js";
import { getCusInvoices } from "./cusUtils.js";

export const getCustomerDetails = async ({
	db,
	customer,
	features,
	org,
	env,
	params = {},
	logger,
	cusProducts,
	expand,
	reqApiVersion,
}: {
	db: DrizzleCli;
	customer: FullCustomer;
	features: Feature[];
	org: Organization;
	env: AppEnv;
	params?: any;
	logger: any;
	cusProducts: FullCusProduct[];
	expand: CusExpand[];
	reqApiVersion?: number;
}) => {
	const apiVersion = orgToVersion({
		org,
		reqApiVersion,
	});

	const withRewards = expand.includes(CusExpand.Rewards);

	const inStatuses = org.config.include_past_due
		? [CusProductStatus.Active, CusProductStatus.PastDue]
		: [CusProductStatus.Active];

	const cusEnts = cusProductsToCusEnts({ cusProducts, inStatuses }) as any;

	const balances = await getCusBalances({
		cusEntsWithCusProduct: cusEnts,
		cusPrices: cusProductsToCusPrices({ cusProducts, inStatuses }),
		org,
		apiVersion,
	});

	const subIds = cusProducts.flatMap(
		(cp: FullCusProduct) => cp.subscription_ids || [],
	);

	const subs = customer.subscriptions || [];
	const { main, addOns } = await processFullCusProducts({
		fullCusProducts: cusProducts,
		subs,
		org,
		apiVersion,
		features,
	});

	if (apiVersion >= LegacyVersion.v1_1) {
		let entList: any = balances.map((b) => {
			const isBoolean =
				features.find((f: Feature) => f.id === b.feature_id)?.type ===
				FeatureType.Boolean;
			if (b.unlimited || isBoolean) {
				return b;
			}

			return ApiCusFeatureV2Schema.parse({
				...b,
				usage: b.used,
				included_usage: b.allowance,
			});
		});

		const products: any = [...main, ...addOns];

		if (apiVersion >= LegacyVersion.v1_2) {
			entList = featuresToObject({
				features,
				entList,
			});
		}

		const withInvoices = expand.includes(CusExpand.Invoices);

		const rewards: RewardResponse | undefined = await getCusRewards({
			org,
			env,
			fullCus: customer,
			subIds,
			expand,
		});

		const upcomingInvoice = await getCusUpcomingInvoice({
			db,
			org,
			env,
			fullCus: customer,
			expand,
		});

		const referrals = await getCusReferrals({
			db,
			fullCus: customer,
			expand,
		});

		const paymentMethod = await getCusPaymentMethodRes({
			org,
			env,
			fullCus: customer,
			expand,
		});

		const cusResponse = {
			...ApiCustomerSchema.parse({
				...customer,
				stripe_id: customer.processor?.id,
				features: entList,
				products,
				// invoices: withInvoices ? invoices : undefined,

				invoices: withInvoices
					? invoicesToResponse({
							invoices: customer.invoices || [],
							logger,
						})
					: undefined,
				trials_used: expand.includes(CusExpand.TrialsUsed)
					? customer.trials_used
					: undefined,
				rewards: withRewards ? rewards : undefined,
				metadata: customer.metadata,
				entities: expand.includes(CusExpand.Entities)
					? customer.entities.map((e) =>
							EntityResponseSchema.parse({
								id: e.id,
								name: e.name,
								customer_id: customer.id,
								feature_id: e.feature_id,
								created_at: e.created_at,
								env: customer.env,
							}),
						)
					: undefined,
				referrals,
				payment_method: paymentMethod,
				upcoming_invoice: upcomingInvoice,
			}),
		};

		if (params?.with_autumn_id === "true") {
			return {
				...cusResponse,
				autumn_id: customer.internal_id,
			};
		} else {
			return cusResponse;
		}
	} else {
		// Probably don't need items...?
		const withItems = org.config.api_version >= BREAK_API_VERSION;

		const processedInvoices = await getCusInvoices({
			db,
			internalCustomerId: customer.internal_id,
			invoices: customer.invoices,
			limit: 20,
			withItems,
			features,
		});

		return {
			customer: CustomerResponseSchema.parse(customer),
			products: main,
			add_ons: addOns,
			entitlements: balances,
			invoices: processedInvoices,
			trials_used: expand.includes(CusExpand.TrialsUsed)
				? customer.trials_used
				: undefined,
		};
	}
};
