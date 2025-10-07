import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { CodeSpan } from "@/views/onboarding2/integrate/components/CodeSpan";
import { useIntegrationContext } from "./IntegrationContext";
import { SectionHeader } from "./SectionHeader";
import { getFrontendSnippet } from "./snippets";

export const FrontendSection = () => {
	const { selectedStack } = useIntegrationContext();
	const snippet = getFrontendSnippet(selectedStack);
	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				stepNumber={6}
				title={
					<span>
						Wrap your React app in <CodeSpan>{"<AutumnProvider />"}</CodeSpan>
					</span>
				}
				description={
					<p>
						<CodeSpan>{"autumnHandler"}</CodeSpan> mounts routes on the{" "}
						<CodeSpan>{"/api/autumn/*"}</CodeSpan> paths which allows our React
						hooks and components to interact with the Autumn API directly.
					</p>
				}
			/>

			<div className="pl-[32px] flex flex-col gap-6">
				<div className="flex flex-col gap-2.5">
					<div className="">
						<CodeGroup value="react">
							<CodeGroupList>
								<CodeGroupTab value="react">
									{selectedStack === "nextjs"
										? "layout.tsx"
										: selectedStack === "rr7"
											? "app/root.tsx"
											: "App.tsx"}
								</CodeGroupTab>
								<CodeGroupCopyButton
									onCopy={() => navigator.clipboard.writeText(snippet)}
								/>
							</CodeGroupList>
							<CodeGroupContent value="react">
								<CodeGroupCode language="jsx">{snippet}</CodeGroupCode>
							</CodeGroupContent>
						</CodeGroup>
					</div>
				</div>
			</div>
		</div>
	);
};
