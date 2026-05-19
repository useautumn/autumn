import { format } from "date-fns";
import { Clock } from "lucide-react";
import { Button } from "@/components/v2/buttons/Button";
import { useViewAsStore } from "@/hooks/stores/useViewAsStore";
import { useIsViewingAsPast } from "../hooks/useEffectiveNow";

export function ViewAsBanner() {
	const isViewAs = useIsViewingAsPast();
	const asOfMs = useViewAsStore((s) => s.asOfMs);
	const clearViewAs = useViewAsStore((s) => s.clearViewAs);

	if (!isViewAs || asOfMs == null) return null;

	const stamp = format(new Date(asOfMs), "d MMM yyyy, HH:mm:ss.SSS");

	return (
		<div className="flex items-center justify-between gap-3 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-t1">
			<div className="flex items-center gap-2 min-w-0">
				<Clock className="size-4 shrink-0 text-orange-500" />
				<span className="truncate">
					You are viewing this customer at the date <strong>{stamp}</strong>
				</span>
			</div>
			<Button variant="muted" size="sm" onClick={clearViewAs}>
				Exit
			</Button>
		</div>
	);
}
