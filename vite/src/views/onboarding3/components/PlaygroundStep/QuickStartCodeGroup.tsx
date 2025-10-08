import type { ProductItem } from "@autumn/shared";
import type { TrackResult } from "autumn-js";
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
import { useProductContext } from "@/views/products/product/ProductContext";
import { getCodeSnippets } from "../../utils/completionStepCode";

type CodeLanguage = "react" | "nodejs" | "response";

const CodeSnippetSection = ({
	title,
	snippets,
	trackResponse,
}: {
	title: string;
	snippets: { react: string; nodejs: string; response: string };
	trackResponse?: TrackResult;
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
	featureId: usedFeatureId,
}: {
	trackResponse?: TrackResult;
	featureId?: string;
}) => {
	const { product } = useProductContext();

	// Use the feature that was actually used (if available), otherwise fallback to first feature
	const firstFeatureItem = product?.items?.find(
		(item: ProductItem) => item.feature_id,
	);
	const featureId = usedFeatureId || firstFeatureItem?.feature_id || undefined;
	const productId = product?.id || undefined;

	// Generate snippets with actual IDs from onboarding
	const snippets = getCodeSnippets(featureId, productId);

	return (
		<SheetSection>
			<div className="space-y-4">
				<CodeSnippetSection
					title="Track usage"
					snippets={snippets.track}
					trackResponse={trackResponse}
				/>
				<CodeSnippetSection
					title="Check feature access"
					snippets={snippets.allowed}
				/>
				<CodeSnippetSection
					title="Create checkout session"
					snippets={snippets.checkout}
				/>
			</div>
		</SheetSection>
	);
};
