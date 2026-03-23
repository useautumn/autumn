import { AppEnv } from "@autumn/shared";
import { FlaskConical, Sailboat } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { useSidebarContext } from "../SidebarContext";

const sandboxStyles = "text-t8 bg-t8/10 border-t8 ";
const liveStyles = "text-primary bg-primary/10 border-primary";

export const StaticEnvPill = () => {
	const env = useEnv();
	const { expanded } = useSidebarContext();

	const isSandbox = env === AppEnv.Sandbox;

	return (
		<div
			className={cn(
				"w-full flex items-center h-6 select-none",
			)}
		>
			<div
				className={cn(
					"flex items-center border gap-2 rounded-md !w-full transition-all duration-300 overflow-hidden",
					isSandbox ? sandboxStyles : liveStyles,
					expanded ? "h-6 pl-1 pr-1" : "w-7 h-6 p-1",
				)}
			>
				<div className="flex items-center gap-2">
					<div className="flex items-center justify-center">
						{isSandbox ? (
							<FlaskConical size={14} className="!h-4 w-4" />
						) : (
							<Sailboat size={14} className="!h-4 w-4" />
						)}
					</div>
					<p className="text-sm">
						{isSandbox ? "Sandbox" : "Production"}
					</p>
				</div>
			</div>
		</div>
	);
};
