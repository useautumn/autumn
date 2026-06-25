import { useMemo } from "react";
import { PricingPreview } from "../onboarding4/PricingPreview";
import { apiPlanToAgentConfig } from "./apiPlanToAgentConfig";
import { LeafChatPanel } from "./LeafChatPanel";
import { useLeafChat } from "./useLeafChat";

export default function ChatView() {
	const {
		messages,
		input,
		setInput,
		isLoading,
		handleSubmit,
		pendingApproval,
		deciding,
		approve,
		reject,
	} = useLeafChat();

	const previewConfig = useMemo(() => {
		const preview = pendingApproval?.preview;
		if (!preview || preview.plans.length === 0) return null;
		return apiPlanToAgentConfig({
			plans: preview.plans.map((entry) => entry.plan),
			features: preview.features,
		});
	}, [pendingApproval]);

	const panel = (
		<LeafChatPanel
			messages={messages}
			input={input}
			onInputChange={setInput}
			onSubmit={handleSubmit}
			isLoading={isLoading}
			pendingApproval={pendingApproval}
			onApprove={approve}
			onReject={reject}
			deciding={deciding}
		/>
	);

	if (!previewConfig) {
		return (
			<div className="flex flex-col h-full min-h-0 w-full max-w-2xl mx-auto">
				{panel}
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 w-full">
			<div className="flex flex-col min-h-0 w-1/2 border-r border-border">
				{panel}
			</div>
			<div className="min-h-0 w-1/2 overflow-y-auto p-6">
				<PricingPreview
					config={previewConfig}
					previewOrg={null}
					isSyncing={false}
				/>
			</div>
		</div>
	);
}
