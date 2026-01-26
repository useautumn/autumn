import { Wallet } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

interface StepProps {
	title: string;
	children: React.ReactNode;
	className?: string;
	description?: React.ReactNode;
	number?: number;
}

function Step({ title, children, className, description, number }: StepProps) {
	return (
		<div
			className={cn(
				"relative pl-8 pb-8 border-l border-stone-200 gap-4 flex flex-col",
				className,
			)}
		>
			<div className="absolute -left-[17px] -top-1 flex items-center justify-center w-8 h-8 rounded-full bg-stone-50 border">
				{/* <Wallet size={16} className="text-t3" /> */}
				<div className="w-6 h-6 rounded-full bg-gradient-to-b from-stone-100 to-stone-100 text-primary font-bold flex items-center justify-center">
					{number || "1"}
				</div>
			</div>
			<div className="flex flex-col gap-8 justify-between lg:flex-row mb-12">
				<div className="flex flex-col gap-4 w-full lg:w-1/3">
					<h1 className="text-t1 text-md font-medium">{title}</h1>
					{description && (
						<div className="text-t2/70 flex flex-col gap-4 w-full">
							{description}
						</div>
					)}
				</div>
				<div className="w-full lg:w-2/3 min-w-md max-w-2xl">{children}</div>
			</div>
		</div>
	);
}

export default Step;
