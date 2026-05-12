import { CaretRightIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;

const STEPS = [
	{ step: 1 as const, label: "Filter" },
	{ step: 2 as const, label: "Operations" },
	{ step: 3 as const, label: "Live" },
];

export function StepIndicator({
	step,
	onStepChange,
}: {
	step: Step;
	onStepChange: (step: Step) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			{STEPS.map((s, i) => (
				<div key={s.step} className="flex items-center gap-2">
					{i > 0 && <CaretRightIcon size={12} className="text-t4" />}
					<button
						type="button"
						onClick={() => onStepChange(s.step)}
						className={cn(
							"flex items-center gap-2 text-sm cursor-pointer",
							step === s.step ? "text-t1 font-medium" : "text-t3 hover:text-t2",
						)}
					>
						<span
							className={cn(
								"w-5 h-5 rounded-md flex items-center justify-center text-xs font-semibold",
								step === s.step
									? "bg-violet-600 text-white"
									: "bg-muted text-t3",
							)}
						>
							{s.step}
						</span>
						{s.label}
					</button>
				</div>
			))}
		</div>
	);
}
