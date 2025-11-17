import { AppEnv } from "@autumn/shared";
import { ChevronDown, FlaskConical, Sailboat } from "lucide-react";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { useSidebarContext } from "../SidebarContext";

export const sandboxStyles = "text-t8 bg-t8/10 border-t8 ";
export const liveStyles = "text-primary bg-purple-100 border-primary ";

export const ExpandedEnvTrigger = ({ isHovered }: { isHovered: boolean }) => {
	const env = useEnv();
	const { expanded } = useSidebarContext();

	const isSandbox = env === AppEnv.Sandbox;
	return (
		<DropdownMenuTrigger
			className={cn(
				"ring-0 focus:ring-0 text-t2  w-full flex items-center bg-transparent h-6 transition-all duration-300 cursor-pointer select-none",
			)}
		>
			<div
				className={cn(
					"flex items-center border gap-2 rounded-md !w-full transition-all duration-300 overflow-hidden justify-between",
					isSandbox ? sandboxStyles : liveStyles,
					expanded ? "h-6 pl-1 pr-1" : "w-7 h-6 p-1",
				)}
			>
				<div className="flex items-center gap-2">
					<div
						className={cn(
							"transition-all duration-200 flex items-center justify-center",
							isHovered && "-translate-x-[1px]",
						)}
					>
						{env === AppEnv.Sandbox ? (
							<FlaskConical size={14} className="!h-4 w-4" />
						) : (
							<Sailboat size={14} className="!h-4 w-4" />
						)}
					</div>
					<p
						className={cn(
							"text-sm transition-all duration-200",
							// expanded
							//   ? "opacity-100 translate-x-0"
							//   : "opacity-0 -translate-x-2 pointer-events-none w-0 m-0 p-0"
						)}
					>
						{isSandbox ? "Sandbox" : "Production"}
					</p>
				</div>
				<ChevronDown size={14} className="!h-4 w-4" />
			</div>
		</DropdownMenuTrigger>
	);
};
