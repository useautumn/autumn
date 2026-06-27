import { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { DefaultView } from "../DefaultView";
import { LeafChatPanel } from "./components/LeafChatPanel";
import { useLeafChat } from "./hooks/useLeafChat";

export default function ChatView() {
	const { threadId: routeThreadId } = useParams<{ threadId?: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const { isAdmin } = useAdmin();
	const draftThreadId = useMemo(() => crypto.randomUUID(), []);
	const threadId = routeThreadId ?? draftThreadId;
	const chatBasePath = location.pathname.startsWith("/sandbox/")
		? "/sandbox/chat"
		: "/chat";

	const {
		messages,
		input,
		setInput,
		isLoading,
		handleSubmit,
		deciding,
		approve,
		reject,
	} = useLeafChat({
		onFirstMessage: () => {
			if (!routeThreadId) {
				navigate(`${chatBasePath}/${threadId}`, { replace: true });
			}
		},
		shouldHydrate: Boolean(routeThreadId),
		threadId,
	});

	// Chat is admin-only; non-admins who navigate here get the default view.
	if (!isAdmin) {
		return <DefaultView />;
	}

	return (
		<div className="flex flex-col h-full min-h-0 w-full max-w-3xl mx-auto pt-6 pb-2">
			<LeafChatPanel
				messages={messages}
				input={input}
				onInputChange={setInput}
				onSubmit={handleSubmit}
				isLoading={isLoading}
				onApprove={approve}
				onReject={reject}
				deciding={deciding}
			/>
		</div>
	);
}
