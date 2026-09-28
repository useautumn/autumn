import { Skeleton } from "@autumn/ui";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
	TABLE_TRAY_SURFACE_ROW_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";

const SKELETON_ROW_KEYS = ["first", "second"];

export function ReviewChangesSkeleton() {
	return (
		<div className="flex flex-col px-4 pt-1">
			<div className="flex h-[42px] items-center gap-[9px]">
				<span className="mx-0.5 size-2.5 shrink-0 rounded-[3px] bg-primary/40" />
				<Skeleton className="h-3.5 w-16" />
			</div>
			<div className={TABLE_TRAY_CLASS}>
				<div className="px-2 pt-2 pb-1.5">
					<Skeleton className="h-3 w-10" />
				</div>
				<div className={TABLE_TRAY_SURFACE_CLASS}>
					{SKELETON_ROW_KEYS.map((key) => (
						<div
							key={key}
							className={cn(
								"flex min-h-11 items-center gap-3 px-3",
								TABLE_TRAY_SURFACE_ROW_CLASS,
							)}
						>
							<Skeleton className="h-3.5 w-32" />
							<span className="flex-1" />
							<Skeleton className="h-[22px] w-16" />
							<Skeleton className="h-3.5 w-14" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
