import { useEffect, useState } from "react";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { codeSnippets } from "../../utils/completionStepCode";

type CodeLanguage = "react" | "nodejs" | "response";

const CodeSnippetSection = ({
	title,
	snippets,
	trackResponse,
}: {
	title: string;
	snippets: { react: string; nodejs: string; response: string };
	trackResponse?: any;
}) => {
	const [activeLanguage, setActiveLanguage] = useState<CodeLanguage>("react");

	// Auto-switch to response tab when trackResponse is available (for track section only)
	useEffect(() => {
		if (trackResponse && title === "Track usage") {
			setActiveLanguage("response");
		}
	}, [trackResponse, title]);

	const getCodeForTab = () => {
		// Use dynamic trackResponse for track section response tab
		if (
			activeLanguage === "response" &&
			title === "Track usage" &&
			trackResponse
		) {
			return JSON.stringify(trackResponse, null, 2);
		}
		return snippets[activeLanguage];
	};

	return (
		<div className="space-y-2">
			<h3 className="text-sub">{title}</h3>
			<CodeGroup
				value={activeLanguage}
				onValueChange={(val) => setActiveLanguage(val as CodeLanguage)}
			>
				<CodeGroupList>
					<CodeGroupTab value="react">React</CodeGroupTab>
					<CodeGroupTab value="nodejs">Node.js</CodeGroupTab>
					<CodeGroupTab value="response">Response</CodeGroupTab>
					<CodeGroupCopyButton
						onCopy={() => navigator.clipboard.writeText(getCodeForTab())}
					/>
				</CodeGroupList>
				<CodeGroupContent value="react">
					<CodeGroupCode language="jsx">{snippets.react}</CodeGroupCode>
				</CodeGroupContent>
				<CodeGroupContent value="nodejs">
					<CodeGroupCode language="js">{snippets.nodejs}</CodeGroupCode>
				</CodeGroupContent>
				<CodeGroupContent value="response">
					<CodeGroupCode language="json">
						{title === "Track usage" && trackResponse
							? JSON.stringify(trackResponse, null, 2)
							: snippets.response}
					</CodeGroupCode>
				</CodeGroupContent>
			</CodeGroup>
		</div>
	);
};

export const QuickStartCodeGroup = ({
	trackResponse,
}: {
	trackResponse?: any;
}) => {
	return (
		<SheetSection>
			<div className="space-y-4">
				<CodeSnippetSection
					title="Track usage"
					snippets={codeSnippets.track}
					trackResponse={trackResponse}
				/>
				<CodeSnippetSection
					title="Check feature access"
					snippets={codeSnippets.allowed}
				/>
				<CodeSnippetSection
					title="Create checkout session"
					snippets={codeSnippets.checkout}
				/>
			</div>
		</SheetSection>
	);
};
