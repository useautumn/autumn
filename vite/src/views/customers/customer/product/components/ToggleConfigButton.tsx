import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const ToggleConfigButton = ({
	configOpen,
	setConfigOpen,
}: {
	configOpen: boolean;
	setConfigOpen: (open: boolean) => void;
}) => {
	return (
		<Button
			variant="ghost"
			className="py-0 relative overflow-hidden w-24 translate-x-2 text-t3"
			onClick={() => setConfigOpen(!configOpen)}
		>
			<div className="flex items-center">
				<div
					className={`overflow-hidden transition-all duration-300 ease-in-out ${
						configOpen ? "w-4 opacity-100" : "w-0 opacity-0"
					}`}
				>
					<ArrowLeft
						size={14}
						className={`transition-transform duration-300 ease-in-out ${
							configOpen ? "translate-x-0" : "-translate-x-full"
						}`}
					/>
				</div>

				<span className="px-1">Advanced</span>

				<div
					className={`overflow-hidden transition-all duration-300 ease-in-out ${
						configOpen ? "w-0 opacity-0" : "w-4 opacity-100"
					}`}
				>
					<ArrowRight
						size={14}
						className={`transition-transform duration-300 ease-in-out ${
							configOpen ? "translate-x-full" : "translate-x-0"
						}`}
					/>
				</div>
			</div>
		</Button>
	);
};
