import type { ReactNode } from "react";

export default function AgentNote({ children }: { children: ReactNode }) {
	return (
		<p className="text-[12px] md:text-[13px] leading-5 text-[#FFFFFF55] font-light font-sans">
			{children}
		</p>
	);
}
