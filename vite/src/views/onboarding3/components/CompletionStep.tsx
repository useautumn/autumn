import { ArrowRight } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductContext } from "@/views/products/product/ProductContext";
import {
	nodejsCode,
	reactCode,
	responseCode,
} from "../utils/completionStepCode";

const FeatureTestRow = ({
	label,
	usage,
}: {
	label: string;
	usage?: string;
}) => (
	<div className="flex gap-2 items-end w-full">
		<div className="flex flex-col gap-1 flex-1">
			<label
				className="text-[13px] font-medium text-[#767676] tracking-[-0.039px]"
				htmlFor={label}
			>
				{label}
			</label>
			<Input
				placeholder="Enter any amount to test"
				className="text-[13px]"
				disabled
			/>
		</div>
		{usage && (
			<Button variant="muted" size="sm" disabled>
				{usage}
			</Button>
		)}
		<Button variant="secondary" size="sm" disabled>
			Send
			<ArrowRight className="size-[14px]" />
		</Button>
	</div>
);

export const CompletionStep = () => {
	const { product } = useProductContext();
	const [activeTab, setActiveTab] = useState("react");
	const [connectStripeOpen, setConnectStripeOpen] = useState(false);

	const getCodeForTab = () => {
		return (
			{
				react: reactCode,
				nodejs: nodejsCode,
				response: responseCode,
			}[activeTab] ?? reactCode
		);
	};

	return (
		<>
			<SheetSection title="Available features">
				<div className="flex flex-col gap-4">
					<FeatureTestRow label="Messages" usage="Used 200" />
					<FeatureTestRow label="API Tokens" />
					<FeatureTestRow label="2000 active users" />
				</div>
			</SheetSection>

			<SheetSection>
				<div className="space-y-0">
					<CodeGroup value={activeTab} onValueChange={setActiveTab}>
						<CodeGroupList>
							<CodeGroupTab value="react">React</CodeGroupTab>
							<CodeGroupTab value="nodejs">Node.js</CodeGroupTab>
							<CodeGroupTab value="response">Response</CodeGroupTab>
							<CodeGroupCopyButton
								onCopy={() => navigator.clipboard.writeText(getCodeForTab())}
							/>
						</CodeGroupList>
						<CodeGroupContent value="react">
							<CodeGroupCode language="jsx">{reactCode}</CodeGroupCode>
						</CodeGroupContent>
						<CodeGroupContent value="nodejs">
							<CodeGroupCode language="js">{nodejsCode}</CodeGroupCode>
						</CodeGroupContent>
						<CodeGroupContent value="response">
							<CodeGroupCode language="json">{responseCode}</CodeGroupCode>
						</CodeGroupContent>
					</CodeGroup>
				</div>
			</SheetSection>
		</>
	);
};
