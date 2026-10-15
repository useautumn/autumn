import { useState } from "react";
import { useLeafPanelStore } from "@/hooks/stores/useLeafPanelStore";
import { LeafChatPanel } from "./components/LeafChatPanel";
import { useLeafChat } from "./hooks/useLeafChat";

const LeafChatContainer = ({
	contentClassName,
	threadId,
}: {
	contentClassName?: string;
	threadId: string;
}) => {
	const markThreadStarted = useLeafPanelStore((s) => s.markThreadStarted);
	// Captured at mount (remounts via key on thread change): hydrate only
	// threads that already have server history, and never mid-conversation.
	const [shouldHydrate] = useState(
		() => useLeafPanelStore.getState().threadStarted,
	);

	const {
		messages,
		input,
		setInput,
		isLoading,
		handleSubmit,
		deciding,
		error,
		queue,
		removeQueued,
		sendQueuedNow,
		answerQuestion,
		approve,
		reject,
		submitCatalogDecision,
	} = useLeafChat({
		onFirstMessage: markThreadStarted,
		shouldHydrate,
		threadId,
	});

	return (
		<LeafChatPanel
			contentClassName={contentClassName}
			deciding={deciding}
			error={error}
			input={input}
			isLoading={isLoading}
			messages={messages}
			onAnswerQuestion={answerQuestion}
			onApprove={approve}
			onInputChange={setInput}
			onRemoveQueued={removeQueued}
			onReject={reject}
			onSendQueuedNow={sendQueuedNow}
			onSubmit={handleSubmit}
			onSubmitCatalogDecision={submitCatalogDecision}
			queue={queue}
		/>
	);
};

export default LeafChatContainer;
