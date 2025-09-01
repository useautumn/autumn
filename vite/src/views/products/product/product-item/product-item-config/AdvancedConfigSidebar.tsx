import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdvancedItemConfig } from "./advanced-config/AdvancedItemConfig";

const ADVANCED_SIDEBAR_WIDTH = 340; // 320px = w-80 in Tailwind

export const AdvancedConfigSidebar = ({
	advancedOpen,
}: {
	advancedOpen: boolean;
}) => {
	return (
		<div
			className={`absolute h-full overflow-hidden right-0 top-0 bg-stone-50 border-l border-stone-200 transition-transform duration-300 ease-in-out ${
				advancedOpen ? "translate-x-0" : "translate-x-full"
			}`}
			style={{ width: `${ADVANCED_SIDEBAR_WIDTH}px` }}
		>
			<AdvancedItemConfig />
		</div>
	);
};

export const MainDialogBodyWrapper = ({
	children,
	advancedOpen,
}: {
	children: React.ReactNode;
	advancedOpen: boolean;
}) => {
	return (
		<div
			className="transition-all duration-300 ease-in-out"
			style={{
				marginRight: advancedOpen ? `${ADVANCED_SIDEBAR_WIDTH}px` : "0px",
			}}
		>
			{children}
		</div>
	);
};

export const ToggleAdvancedConfigButton = ({
	advancedOpen,
	setAdvancedOpen,
	showAdvancedButton,
}: {
	advancedOpen: boolean;
	setAdvancedOpen: (open: boolean) => void;
	showAdvancedButton: boolean;
}) => {
	return showAdvancedButton ? (
		<div className="flex justify-end px-6 pt-4 pb-4">
			<Button
				variant="ghost"
				onClick={() => {
					setAdvancedOpen(!advancedOpen);
				}}
				className="flex items-center gap-1 text-t3"
				size="sm"
			>
				<ChevronRight
					size={12}
					className={`transition-transform duration-200 ${
						advancedOpen ? "rotate-180" : "rotate-0"
					}`}
				/>
				{advancedOpen ? "Hide Advanced" : "Show Advanced"}
			</Button>
		</div>
	) : (
		<div className="py-4"></div>
	);
};
