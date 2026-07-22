import type { FullCustomer, FullCustomerEntitlement } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resetCusEnts } from "@/internal/balances/utils/sql/client.js";
import { applyResetResults } from "@/internal/customers/actions/resetCustomerEntitlements/applyResetResults.js";
import {
	type ProcessResetResult,
	processReset,
} from "@/internal/customers/actions/resetCustomerEntitlements/processReset.js";
import { processResetResultToResetCusEntParam } from "@/internal/customers/actions/resetCustomerEntitlements/processResetResultToResetCusEntParam.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

export const resetPooledBalances = async ({
	ctx,
	fullCustomer,
	pooledCustomerEntitlements,
	source,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	pooledCustomerEntitlements: FullCustomerEntitlement[];
	source: string;
}) => {
	const computed: Array<{
		cusEntId: string;
		result: ProcessResetResult;
	}> = [];

	for (const customerEntitlement of pooledCustomerEntitlements) {
		const result = await processReset({
			ctx,
			cusEnt: { ...customerEntitlement, customer_product: null },
		});
		if (result) computed.push({ cusEntId: customerEntitlement.id, result });
	}

	if (computed.length === 0) return;

	const resets = computed.map(({ cusEntId, result }) =>
		processResetResultToResetCusEntParam({
			customerEntitlementId: cusEntId,
			result,
		}),
	);
	const { applied, skipped } = await resetCusEnts({ ctx, resets });

	await applyResetResults({
		ctx,
		fullCus: fullCustomer,
		computed,
		skipped,
	});

	if (Object.keys(applied).length > 0) {
		await invalidateCachedFullSubject({
			ctx,
			customerId: fullCustomer.id ?? fullCustomer.internal_id,
			source,
		});
	}
};
