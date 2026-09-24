import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { HeldSchedulePhases } from "./types/heldSchedulePhases";

export const executeDropHeldSchedulePhases = async ({
	ctx,
	held,
}: {
	ctx: AutumnContext;
	held: HeldSchedulePhases;
}) => {
	for (const customerProduct of held.heldRows) {
		await CusProductService.delete({ ctx, cusProductId: customerProduct.id });
	}
	for (const customerProduct of held.phaseEndRows) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: { ended_at: null, scheduled_ids: [] },
		});
	}

	return {
		droppedCount: held.heldRows.length,
		clearedCount: held.phaseEndRows.length,
	};
};
