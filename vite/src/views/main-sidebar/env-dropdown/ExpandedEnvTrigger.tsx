import { AppEnv } from "@autumn/shared";
import { cn } from "@/lib/utils";
import { FlaskConical, Sailboat } from "lucide-react";
import { useEnv } from "@/utils/envUtils";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSidebarContext } from "../SidebarContext";

export const sandboxStyles =
	"text-amber-600 bg-amber-100 border-amber-500 w-[100px]";
export const liveStyles = "text-primary bg-purple-100 border-primary w-[120px]";

export const ExpandedEnvTrigger = ({ isHovered }: { isHovered: boolean }) => {
	const env = useEnv();
	const { expanded } = useSidebarContext();

	const isSandbox = env === AppEnv.Sandbox;
	return (
		<DropdownMenuTrigger
			className={cn(
				"ring-0 focus:ring-0 text-t2 rounded-sm w-full flex items-center bg-transparent h-6 transition-all duration-300",
			)}
		>
			<div
				className={cn(
					"flex items-center border gap-2 rounded-xs transition-all duration-300 overflow-hidden",
					isSandbox ? sandboxStyles : liveStyles,
					expanded ? "h-6 pl-1 pr-4" : "w-7 h-6 p-1",
				)}
			>
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
		</DropdownMenuTrigger>
	);
};
