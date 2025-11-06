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
	const snippet = `import { PricingTable } from 'autumn-js/react'

const PricingTableComponent = () => {
    return (
        <section className="max-w-7xl mx-auto pt-24 pb-16" id="pricing">
            <h2 className="text-3xl md:text-4xl text-center font-bold mb-6">Pricing</h2>
            <PricingTable />
        </section>
    )
}

export default PricingTableComponent`;

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				stepNumber={6}
				title={
					<span>
						Drop in <CodeSpan>{"<PricingTable />"}</CodeSpan>
					</span>
				}
				description="This allows you to use our React hooks and components in your app. If your server URL is different to your client, you will need to pass in the backend URL as a prop."
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
