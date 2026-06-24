import { PricingChatPanel } from "../onboarding4/components/PricingChatPanel";
import { useLeafChat } from "./useLeafChat";

export default function ChatView() {
	const { messages, input, setInput, isLoading, handleSubmit } = useLeafChat();

	return (
		<div className="flex flex-col h-full min-h-0 w-full max-w-2xl mx-auto">
			<PricingChatPanel
				messages={messages}
				input={input}
				onInputChange={setInput}
				onSubmit={handleSubmit}
				isLoading={isLoading}
				placeholder="Ask Autumn anything…"
				className="flex-1 min-h-0"
				messageContentClassName="group-[.is-user]:bg-white/10 group-[.is-user]:border-0 group-[.is-user]:px-3 group-[.is-user]:py-2"
				thinkingLabel="Thinking…"
			/>
		</div>
	);
}
