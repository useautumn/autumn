import { AgentActivityIndicator } from "./AgentActivityIndicator";
import type { SessionStage } from "./cloudAgentSessionData";

export function CloudAgentToolCalls({
	stage,
	time,
	playing,
}: {
	stage: SessionStage;
	time: number;
	playing: boolean;
}) {
	return (
		<div className="space-y-0.5 leading-4">
			{stage.tools.map((tool, index) => {
				const previous = stage.tools[index - 1];
				if (previous && time < previous.at) return null;
				const done = time >= tool.at;
				return (
					<details key={tool.label} className="group">
						<summary className="flex cursor-pointer list-none items-center gap-2 rounded px-1 py-2 text-[13px] leading-4 hover:bg-[#222] focus-visible:outline-[#9564ff] [&::-webkit-details-marker]:hidden">
							<AgentActivityIndicator running={!done && playing} />
							<span className="flex-1 text-[#aaa]">{tool.label}</span>
							<span
								aria-hidden="true"
								className="text-[#555] group-open:rotate-90"
							>
								›
							</span>
						</summary>
						<div className="ml-2 border-l border-[#36313c] py-2 pl-4 text-[13px] leading-5 text-[#888]">
							{done ? tool.detail : "In progress"}
						</div>
					</details>
				);
			})}
		</div>
	);
}
