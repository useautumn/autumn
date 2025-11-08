import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { CodeSpan } from "@/views/onboarding2/integrate/components/CodeSpan";
import { SectionHeader } from "./SectionHeader";

export const PricingTableSection = () => {
	const snippet = `import { PricingTable } from "autumn-js/react";

export default function Home() {
  return (
    <div className="w-full h-full">
      <PricingTable productDetails={productDetails} />
    </div>
  );
}`;

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				stepNumber={6}
				title={
					<span>
						Drop in <CodeSpan>{"<PricingTable />"}</CodeSpan>
					</span>
				}
				description="This will display your pricing plans in a table format. You can customize the table by passing in the product details as a prop."
			/>

			<div className="pl-[32px] flex flex-col gap-6">
				<div className="flex flex-col gap-2.5">
					<div className="">
						<CodeGroup value="react">
							<CodeGroupList>
								<CodeGroupTab value="react">layout.tsx</CodeGroupTab>
								<CodeGroupCopyButton
									onCopy={() => navigator.clipboard.writeText(snippet)}
								/>
							</CodeGroupList>
							<CodeGroupContent value="react" copyText={snippet}>
								<CodeGroupCode language="jsx">{snippet}</CodeGroupCode>
							</CodeGroupContent>
						</CodeGroup>
					</div>
				</div>
			</div>
		</div>
	);
};
