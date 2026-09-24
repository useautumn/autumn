import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { SchedulePhaseRows } from "./types/schedulePhaseRows";

export const executeDetachSchedulePhases = async ({
	ctx,
	rows,
}: {
	ctx: AutumnContext;
	rows: SchedulePhaseRows;
}) => {
	for (const customerProduct of rows.scheduledRows) {
		await CusProductService.delete({ ctx, cusProductId: customerProduct.id });
	}
	for (const customerProduct of rows.phaseEndRows) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: { ended_at: null, scheduled_ids: [] },
		});
	}

	return {
		detachedCount: rows.scheduledRows.length,
		clearedCount: rows.phaseEndRows.length,
	};
};
