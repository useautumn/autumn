import type {
	FullCustomer,
	FullCustomerEntitlement,
	FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js";

const runtimeCustomerEntitlements = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}) => [
	...fullSubject.customer_products.flatMap(
		(customerProduct) => customerProduct.customer_entitlements,
	),
	...fullSubject.extra_customer_entitlements,
	...(fullSubject.pooled_customer_entitlements ?? []),
];

export const copyAttachRuntimeBalanceFields = ({
	postgresCustomerEntitlement,
	runtimeCustomerEntitlement,
}: {
	postgresCustomerEntitlement: FullCustomerEntitlement;
	runtimeCustomerEntitlement: FullCustomerEntitlement;
}): FullCustomerEntitlement => ({
	...postgresCustomerEntitlement,
	balance: runtimeCustomerEntitlement.balance,
	additional_balance: runtimeCustomerEntitlement.additional_balance,
	adjustment: runtimeCustomerEntitlement.adjustment,
	entities: runtimeCustomerEntitlement.entities,
	replaceables: runtimeCustomerEntitlement.replaceables,
	rollovers: runtimeCustomerEntitlement.rollovers,
});

/**
 * Billing structure still comes from Postgres. Only the mutable balance facts
 * are overlaid from Redis, where accepted-but-not-yet-synced tracks live.
 */
export const overlayAttachRuntimeBalances = async ({
	ctx,
	fullCustomer,
	entityId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	entityId?: string;
}): Promise<FullCustomer> => {
	if (ctx.skipCache) return fullCustomer;

	const { fullSubject } = await getCachedFullSubject({
		ctx,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		entityId,
		source: "setupAttachBillingContext",
		runLazyResets: false,
	});
	if (!fullSubject) return fullCustomer;

	const runtimeById = new Map(
		runtimeCustomerEntitlements({ fullSubject }).map((customerEntitlement) => [
			customerEntitlement.id,
			customerEntitlement,
		]),
	);
	const overlayEntitlement = (
		customerEntitlement: FullCustomerEntitlement,
	): FullCustomerEntitlement => {
		const runtimeCustomerEntitlement = runtimeById.get(customerEntitlement.id);
		return runtimeCustomerEntitlement
			? copyAttachRuntimeBalanceFields({
					postgresCustomerEntitlement: customerEntitlement,
					runtimeCustomerEntitlement,
				})
			: customerEntitlement;
	};

	return {
		...fullCustomer,
		customer_products: fullCustomer.customer_products.map(
			(customerProduct) => ({
				...customerProduct,
				customer_entitlements:
					customerProduct.customer_entitlements.map(overlayEntitlement),
			}),
		),
		extra_customer_entitlements:
			fullCustomer.extra_customer_entitlements.map(overlayEntitlement),
		pooled_customer_entitlements:
			fullCustomer.pooled_customer_entitlements?.map(overlayEntitlement),
	};
};
