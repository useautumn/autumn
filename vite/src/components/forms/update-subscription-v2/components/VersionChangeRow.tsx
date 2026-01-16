import { GitBranchIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { getRowRingClass } from "../utils/ringClassUtils";

interface VersionChangeRowProps {
	currentVersion: number;
	selectedVersion: number;
}

export function VersionChangeRow({
	currentVersion,
	selectedVersion,
}: VersionChangeRowProps) {
	return (
		<div
			className={cn(
				"flex items-center w-full h-10 px-3 rounded-xl input-base",
				getRowRingClass("version"),
			)}
		>
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
				<GitBranchIcon size={14} weight="duotone" className="text-purple-500" />
				<span className="text-sm text-t2">Plan Version</span>
			</div>
			<div className="flex items-center gap-1 text-xs">
				<span className="text-red-500">v{currentVersion}</span>
				<span className="text-t3">→</span>
				<span className="text-green-500">v{selectedVersion}</span>
			</div>
		</div>
	);
}
