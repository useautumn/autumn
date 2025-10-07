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
	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				stepNumber={7}
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
									onCopy={() =>
										navigator.clipboard.writeText(
											`AUTUMN_SECRET_KEY=am_sk_12345`,
										)
									}
								/>
							</CodeGroupList>
							<CodeGroupContent value="react">
								<CodeGroupCode language="jsx">{`import { AutumnProvider } from "autumn-js/react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode,
}) {
  return (
    <html>
      <body>
        <AutumnProvider>
          {children}
        </AutumnProvider>
      </body>
    </html>
  );
}`}</CodeGroupCode>
							</CodeGroupContent>
						</CodeGroup>
					</div>
				</div>
			</div>
		</div>
	);
};
