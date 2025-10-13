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
import { getBackendSnippet } from "./snippets";

export const BackendSection = () => {
	const { selectedStack, selectedAuth, customerType, secretKey, setSecretKey } =
		useIntegrationContext();

	const snippet = getBackendSnippet(
		selectedStack,
		selectedAuth,
		customerType,
		secretKey,
	);
	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				stepNumber={5}
				title={
					<span>
						Mount <CodeSpan>{"autumnHandler"}</CodeSpan> to your backend
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
						<CodeGroup value=".env">
							<CodeGroupList>
								<CodeGroupTab value=".env">.env</CodeGroupTab>
								<CodeGroupCopyButton
									onCopy={() =>
										navigator.clipboard.writeText(
											`AUTUMN_SECRET_KEY=${secretKey}`,
										)
									}
								/>
							</CodeGroupList>
							<CodeGroupContent
								value=".env"
								copyText={`AUTUMN_SECRET_KEY=${secretKey}`}
							>
								<CodeGroupCode>{`AUTUMN_SECRET_KEY=${secretKey}`}</CodeGroupCode>
							</CodeGroupContent>
						</CodeGroup>
					</div>

					<div className="">
						<CodeGroup value="handler">
							<CodeGroupList>
								<CodeGroupTab value="handler">
									{selectedStack === "nextjs"
										? "app/api/autumn/[...all]/route.ts"
										: selectedStack === "rr7"
											? "app/routes/api.autumn.$.tsx"
											: `${selectedStack === "express" ? "server" : "app"}.${selectedStack === "elysia" ? "ts" : "js"}`}
								</CodeGroupTab>
								<CodeGroupCopyButton
									onCopy={() => navigator.clipboard.writeText(snippet)}
								/>
							</CodeGroupList>
							<CodeGroupContent value="handler" copyText={snippet}>
								<CodeGroupCode language="typescript">{snippet}</CodeGroupCode>
							</CodeGroupContent>
						</CodeGroup>
					</div>
				</div>
			</div>
		</div>
	);
};
