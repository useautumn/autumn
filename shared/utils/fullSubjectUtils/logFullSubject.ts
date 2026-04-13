import type { FullSubject } from "../../models/cusModels/fullSubject/fullSubjectModel.js";

/** Logs a compact summary of a FullSubject without flooding the terminal. */
export const logFullSubject = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}) => {
	const summarizeProduct = (cp: FullSubject["customer_products"][number]) => ({
		id: cp.id,
		product_id: cp.product_id,
		status: cp.status,
		internal_entity_id: cp.internal_entity_id ?? null,
		customer_entitlements: cp.customer_entitlements.map((ce) => ({
			id: ce.id,
			feature_id: ce.entitlement?.feature?.id,
			feature_type: ce.entitlement?.feature?.type,
			balance: ce.balance,
			unlimited: ce.unlimited,
			usage_allowed: ce.usage_allowed,
			rollovers: ce.rollovers?.length ?? 0,
		})),
		customer_prices: cp.customer_prices.length,
	});

	const summarizeCusEnt = (
		ce: FullSubject["extra_customer_entitlements"][number],
	) => ({
		id: ce.id,
		feature_id: ce.entitlement?.feature?.id,
		feature_type: ce.entitlement?.feature?.type,
		balance: ce.balance,
		unlimited: ce.unlimited,
		usage_allowed: ce.usage_allowed,
		rollovers: ce.rollovers?.length ?? 0,
	});

	const summary = {
		subjectType: fullSubject.subjectType,
		customerId: fullSubject.customerId,
		entityId: fullSubject.entityId ?? null,
		customer: {
			id: fullSubject.customer.id,
			internal_id: fullSubject.customer.internal_id,
			name: fullSubject.customer.name,
			email: fullSubject.customer.email,
		},
		customer_products: fullSubject.customer_products.map(summarizeProduct),
		extra_customer_entitlements:
			fullSubject.extra_customer_entitlements.map(summarizeCusEnt),
		subscriptions: fullSubject.subscriptions?.length ?? 0,
		invoices: fullSubject.invoices?.length ?? 0,
		aggregated_customer_products:
			fullSubject.aggregated_customer_products?.map((cp) => ({
				id: cp.id,
				product_id: cp.product_id,
				status: cp.status,
			})) ?? "N/A",
		aggregated_customer_entitlements:
			fullSubject.aggregated_customer_entitlements?.map((ae) => ({
				api_id: ae.api_id,
				feature_id: ae.feature_id,
				balance: ae.balance,
				unlimited: ae.unlimited,
				entity_count: ae.entity_count,
			})) ?? "N/A",
	};

	console.log(JSON.stringify(summary, null, 2));
};
