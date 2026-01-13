import type { ReactNode } from "react";
import { BorderBeam } from "@/components/ui/border-beam";

interface ChatInputWithBeamProps {
	children: ReactNode;
	showBeam?: boolean;
}

export function ChatInputWithBeam({
	children,
	showBeam = true,
}: ChatInputWithBeamProps) {
	return (
		<div className="relative rounded-xl">
			{children}
			{showBeam && (
				<BorderBeam
					size={120}
					duration={8}
					colorFrom="#10b981"
					colorTo="#6366f1"
					borderWidth={2}
				/>
			)}
		</div>
	);
}
