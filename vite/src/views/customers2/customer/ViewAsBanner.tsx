import type { Entity } from "@autumn/shared";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import { Button } from "@/components/v2/buttons/Button";
import { useViewAsStore } from "@/hooks/stores/useViewAsStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useIsViewingAsPast } from "../hooks/useEffectiveNow";

export function ViewAsBanner() {
	const isViewAs = useIsViewingAsPast();
	const asOfMs = useViewAsStore((s) => s.asOfMs);
	const entityId = useViewAsStore((s) => s.entityId);
	const clearViewAs = useViewAsStore((s) => s.clearViewAs);
	const { customer } = useCusQuery();

	if (!isViewAs || asOfMs == null) return null;

	const stamp = format(new Date(asOfMs), "d MMM yyyy, HH:mm:ss.SSS");
	const pinnedEntity = entityId
		? ((customer?.entities ?? []) as Entity[]).find(
				(e) => e.id === entityId || e.internal_id === entityId,
			)
		: null;
	const entityLabel = pinnedEntity?.name || pinnedEntity?.id || entityId;

	return (
		<div className="flex items-center justify-between gap-3 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-t1">
			<div className="flex items-center gap-2 min-w-0">
				<Clock className="size-4 shrink-0 text-orange-500" />
				<span className="truncate">
					You are viewing this customer at expiration <strong>{stamp}</strong>
					{entityLabel ? (
						<>
							{" "}
							— Entity <strong>{entityLabel}</strong>
						</>
					) : null}
				</span>
			</div>
			<Button variant="muted" size="sm" onClick={clearViewAs}>
				Exit
			</Button>
		</div>
	);
}
