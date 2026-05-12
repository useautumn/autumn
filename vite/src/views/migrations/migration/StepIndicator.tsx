import { CaretRightIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type StepId = "filter" | "operations" | "live";

export const STEPS: { id: StepId; label: string }[] = [
	{ id: "filter", label: "Filter" },
	{ id: "operations", label: "Operations" },
	{ id: "live", label: "Live" },
];

export function StepIndicator({
	step,
	onStepChange,
}: {
	step: StepId;
	onStepChange: (step: StepId) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			{STEPS.map((s, i) => (
				<div key={s.id} className="flex items-center gap-2">
					{i > 0 && <CaretRightIcon size={12} className="text-t4" />}
					<button
						type="button"
						onClick={() => onStepChange(s.id)}
						className={cn(
							"flex items-center gap-2 text-sm cursor-pointer",
							step === s.id ? "text-t1 font-medium" : "text-t3 hover:text-t2",
						)}
					>
						<span
							className={cn(
								"w-5 h-5 rounded-md flex items-center justify-center text-xs font-semibold",
								step === s.id
									? "bg-violet-600 text-white"
									: "bg-muted text-t3",
							)}
						>
							{i + 1}
						</span>
						{s.label}
					</button>
				</div>
			))}
		</div>
	);
}
