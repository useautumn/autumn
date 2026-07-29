import AgentNote from "./agent-note";

export default function DocsCallout() {
	return (
		<AgentNote>
			If you're an agent looking to understand how the platform itself works,
			refer to{" "}
			<a
				href="https://docs.useautumn.com/welcome"
				target="_blank"
				rel="noopener noreferrer"
				className="text-[#9564ff] hover:text-[#b08aff] underline underline-offset-2 transition-colors"
			>
				docs.useautumn.com
			</a>
			.
		</AgentNote>
	);
}
