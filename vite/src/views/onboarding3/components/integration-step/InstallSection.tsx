import { useState } from "react";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { SectionHeader } from "./SectionHeader";

export const InstallSection = () => {
	const [pm, setPm] = useState<"npm" | "pnpm" | "yarn" | "bun">("npm");

	return (
		<div className="flex flex-col gap-6">
			<SectionHeader
				stepNumber={4}
				title="Install autumn-js"
				className="gap-0"
			/>

			<div className="pl-[32px] flex flex-col gap-6">
				<div className="flex flex-col gap-2.5">
					<div className="">
						<CodeGroup value={pm}>
							<CodeGroupList>
								<CodeGroupTab value="npm" onClick={() => setPm("npm")}>
									npm
								</CodeGroupTab>
								<CodeGroupTab value="pnpm" onClick={() => setPm("pnpm")}>
									pnpm
								</CodeGroupTab>
								<CodeGroupTab value="yarn" onClick={() => setPm("yarn")}>
									yarn
								</CodeGroupTab>
								<CodeGroupTab value="bun" onClick={() => setPm("bun")}>
									bun
								</CodeGroupTab>
								<CodeGroupCopyButton
									onCopy={() => {
										const commands = {
											npm: "npm install autumn-js",
											pnpm: "pnpm add autumn-js",
											yarn: "yarn add autumn-js",
											bun: "bun add autumn-js",
										};
										// Find the active tab by looking for the data-state="active" attribute
										const activeTab =
											document
												.querySelector('[data-state="active"]')
												?.getAttribute("value") || "npm";
										navigator.clipboard.writeText(
											commands[activeTab as keyof typeof commands],
										);
									}}
								/>
							</CodeGroupList>
							<CodeGroupContent value="npm" copyText="npm install autumn-js">
								<CodeGroupCode>{`npm install autumn-js`}</CodeGroupCode>
							</CodeGroupContent>
							<CodeGroupContent value="pnpm" copyText="pnpm add autumn-js">
								<CodeGroupCode>{`pnpm add autumn-js`}</CodeGroupCode>
							</CodeGroupContent>
							<CodeGroupContent value="yarn" copyText="yarn add autumn-js">
								<CodeGroupCode>{`yarn add autumn-js`}</CodeGroupCode>
							</CodeGroupContent>
							<CodeGroupContent value="bun" copyText="bun add autumn-js">
								<CodeGroupCode>{`bun add autumn-js`}</CodeGroupCode>
							</CodeGroupContent>
						</CodeGroup>
					</div>
				</div>
			</div>
		</div>
	);
};
