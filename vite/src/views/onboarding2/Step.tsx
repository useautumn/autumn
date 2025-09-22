import React from "react";
import { cn } from "@/lib/utils";
import { Wallet } from "lucide-react";

interface StepProps {
	title: string;
	children: React.ReactNode;
	className?: string;
	description?: React.ReactNode;
	number?: number;
}

function Step({ title, children, className, description, number }: StepProps) {
	return (
		<div className={cn("flex flex-col gap-4", className)}>
			<div className="flex items-center gap-2 w-full">
				<div className="w-6 h-6 rounded-full bg-gradient-to-b from-stone-100 to-stone-100 text-primary font-bold flex items-center justify-center">
					{number || "1"}
				</div>

				<h1 className="text-t1 text-md font-medium">{title}</h1>
			</div>
			<div className="text-md text-t3">{description}</div>

			{children}
		</div>
	);
}

export default Step;
