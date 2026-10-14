import type { UpdateCustomerEntitlement } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService";

export const writeCustomerEntitlementReplaceables = async ({
	ctx,
	update,
}: {
	ctx: AutumnContext;
	update: UpdateCustomerEntitlement;
}): Promise<void> => {
	const { updates, insertReplaceables, deletedReplaceables } = update;
	if (updates) return;
	if (insertReplaceables && insertReplaceables.length > 0) {
		await RepService.insert({ ctx, data: insertReplaceables });
	}
	if (deletedReplaceables && deletedReplaceables.length > 0) {
		await RepService.deleteInIds({
			ctx,
			ids: deletedReplaceables.map((replaceable) => replaceable.id),
		});
	}
};
