import type { ProductItem } from "@autumn/shared";
import type { CheckResult, TrackResult } from "autumn-js";
import { useCustomer } from "autumn-js/react";
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
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useOnboardingStore } from "../../store/useOnboardingStore";
import { getCodeSnippets } from "../../utils/completionStepCode";

type CodeLanguage = "react" | "nodejs" | "response";

const CodeSnippetSection = ({
	title,
	snippets,
	trackResponse,
	checkResponse,
}: {
	title: string;
	snippets: { react: string; nodejs: string; response: string };
	trackResponse?: TrackResult;
	checkResponse?: CheckResult;
}) => {
	const [activeLanguage, setActiveLanguage] = useState<CodeLanguage>("react");

	// Auto-switch to response tab when responses are available
	useEffect(() => {
		if (trackResponse && title === "Track usage") {
			setActiveLanguage("response");
		}
		if (checkResponse && title === "Check feature access") {
			setActiveLanguage("response");
		}
	}, [trackResponse, checkResponse, title]);

	const getCodeForTab = () => {
		// Use dynamic responses for response tabs
		if (activeLanguage === "response") {
			if (title === "Track usage" && trackResponse) {
				return JSON.stringify(trackResponse, null, 2);
			}
			if (title === "Check feature access" && checkResponse) {
				return JSON.stringify(checkResponse, null, 2);
			}
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
							: title === "Check feature access" && checkResponse
								? JSON.stringify(checkResponse, null, 2)
								: snippets.response}
					</CodeGroupCode>
				</CodeGroupContent>
			</CodeGroup>
		</div>
	);
};

const CustomerSection = () => {
	const { customer } = useCustomer();
	const [activeTab, setActiveTab] = useState("customer");

	return (
		<div className="space-y-2">
			<h3 className="text-sub">Customer</h3>
			<CodeGroup value={activeTab} onValueChange={setActiveTab}>
				<CodeGroupList>
					<CodeGroupTab value="customer">Customer Response</CodeGroupTab>
					<CodeGroupCopyButton
						onCopy={() =>
							navigator.clipboard.writeText(JSON.stringify(customer, null, 2))
						}
					/>
				</CodeGroupList>
				<CodeGroupContent value="customer">
					<CodeGroupCode language="json">
						{JSON.stringify(customer, null, 2)}
					</CodeGroupCode>
				</CodeGroupContent>
			</CodeGroup>
		</div>
	);
};

export const QuickStartCodeGroup = ({
	trackResponse,
	checkResponse,
	featureId: usedFeatureId,
}: {
	trackResponse?: TrackResult;
	checkResponse?: CheckResult;
	featureId?: string;
}) => {
	const { product } = useProductStore();
	const { features } = useFeaturesQuery();
	const lastUsedProductId = useOnboardingStore(
		(state) => state.lastUsedProductId,
	);

	// Use the feature that was actually used (if available), otherwise fallback to first feature
	const firstFeatureItem = product?.items?.find(
		(item: ProductItem) => item.feature_id,
	);
	const featureId = usedFeatureId || firstFeatureItem?.feature_id || undefined;

	// Use lastUsedProductId (from pricing card clicks) or fallback to current product
	const productId = lastUsedProductId || product?.id || undefined;

	// Get the actual feature name from features list
	const featureName = features.find((f) => f.id === featureId)?.name;

	// Generate snippets with actual IDs from onboarding
	const snippets = getCodeSnippets(featureId, productId, featureName);

	return (
		<SheetSection>
			<div className="space-y-4">
				<CodeSnippetSection
					title="Check feature access"
					snippets={snippets.allowed}
					checkResponse={checkResponse}
				/>
				<CodeSnippetSection
					title="Track usage"
					snippets={snippets.track}
					trackResponse={trackResponse}
				/>
				<CodeSnippetSection title="Checkout" snippets={snippets.checkout} />
				<CustomerSection />
			</div>
		</SheetSection>
	);
};
