import { IconButton, useIsMobile } from "@autumn/ui";
import {
	ArrowsInSimpleIcon,
	ArrowsOutSimpleIcon,
	LeafIcon,
	PlusIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHotkeys } from "react-hotkeys-hook";
import { PortalContainerContext } from "@/contexts/PortalContainerContext";
import { useCommandBarStore } from "@/hooks/stores/useCommandBarStore";
import { useLeafPanelStore } from "@/hooks/stores/useLeafPanelStore";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { LeafChatPanel } from "./components/LeafChatPanel";
import { LeafThreadHistory } from "./components/LeafThreadHistory";
import { useLeafChat } from "./hooks/useLeafChat";

// Geometry animates via reflow (right/bottom-anchored in both modes) instead of
// a motion layout FLIP, which scale-warps children mid-transition.
const GEOMETRY_TRANSITION = ["width", "height", "right", "bottom"]
	.map((property) => `${property} 300ms cubic-bezier(0.32, 0.72, 0, 1)`)
	.join(", ");
// Show/hide is a corner-origin scale — no translate, so closing never reads as
// a layout shift. Exit is faster than enter. Tailwind v4 scale-* sets the CSS
// `scale` property (not `transform`), so that's what must be transitioned.
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const SHOW_TRANSITION = `${GEOMETRY_TRANSITION}, opacity 160ms ${EASE_OUT}, scale 160ms ${EASE_OUT}`;
const HIDE_TRANSITION = `${GEOMETRY_TRANSITION}, opacity 110ms ${EASE_OUT}, scale 110ms ${EASE_OUT}`;

/** Linear-style chat panel portaled into the main content container: docked
 * card bottom-right, expandable to overlay the content area (not the sidebar). */
export const LeafPanel = () => {
	const { isAdmin } = useAdmin();
	const isMobile = useIsMobile();
	const containerRef = useContext(PortalContainerContext);
	const open = useLeafPanelStore((s) => s.open);
	const mode = useLeafPanelStore((s) => s.mode);
	const threadId = useLeafPanelStore((s) => s.threadId);
	const togglePanel = useLeafPanelStore((s) => s.togglePanel);
	const closePanel = useLeafPanelStore((s) => s.closePanel);
	const setMode = useLeafPanelStore((s) => s.setMode);
	const newThread = useLeafPanelStore((s) => s.newThread);
	const commandBarOpen = useCommandBarStore((s) => s.open);

	// Lazy keep-alive: nothing mounts until first open; afterwards the panel stays
	// mounted while hidden so the conversation and in-flight streams survive.
	const [hasOpened, setHasOpened] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (open) setHasOpened(true);
	}, [open]);
	// hasOpened in deps: on the very first open the panel mounts a render after
	// `open` flips, so the composer only exists once hasOpened commits. threadId
	// in deps: new thread / resumed thread remounts the composer unfocused.
	useEffect(() => {
		if (open && hasOpened) {
			panelRef.current?.querySelector("textarea")?.focus();
		}
	}, [open, hasOpened, threadId]);

	// meta+i is impersonate while the command bar is open — yield to it there.
	useHotkeys(["meta+i", "ctrl+i"], togglePanel, {
		enableOnFormTags: true,
		enabled: isAdmin && !isMobile && !commandBarOpen,
		preventDefault: true,
	});

	useHotkeys(["meta+n", "ctrl+n"], newThread, {
		enableOnFormTags: true,
		enabled: open && isAdmin && !isMobile,
		preventDefault: true,
	});

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			if (useLeafPanelStore.getState().mode === "expanded") {
				setMode("docked");
			} else {
				closePanel();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, setMode, closePanel]);

	const container = containerRef?.current;
	if (!isAdmin || isMobile || !hasOpened || !container) return null;

	const expanded = mode === "expanded";

	return createPortal(
		<>
			<button
				aria-label="Collapse chat"
				className={cn(
					"absolute inset-0 z-40 bg-black/15 transition-opacity duration-200",
					open && expanded ? "opacity-100" : "pointer-events-none opacity-0",
				)}
				onClick={() => setMode("docked")}
				tabIndex={-1}
				type="button"
			/>
			<div
				className={cn(
					"absolute z-50 flex origin-bottom-right flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl",
					expanded
						? "right-2 bottom-2 h-[calc(100%-16px)] w-[calc(100%-16px)]"
						: "right-3 bottom-3 h-[min(70%,640px)] w-[400px]",
					open
						? "starting:scale-[0.98] starting:opacity-0 scale-100 opacity-100"
						: "pointer-events-none scale-[0.98] opacity-0",
				)}
				inert={!open}
				ref={panelRef}
				style={{ transition: open ? SHOW_TRANSITION : HIDE_TRANSITION }}
			>
				<div className="flex h-10 shrink-0 items-center justify-between px-3">
					<div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
						<LeafIcon size={14} weight="fill" />
						Leaf
					</div>
					<div className="flex items-center gap-1.5">
						<LeafThreadHistory />
						<IconButton
							className="cursor-pointer"
							icon={<PlusIcon size={12} />}
							onClick={newThread}
							size="icon"
							title="New thread"
							variant="skeleton"
						/>
						<IconButton
							className="cursor-pointer"
							icon={
								expanded ? (
									<ArrowsInSimpleIcon size={12} />
								) : (
									<ArrowsOutSimpleIcon size={12} />
								)
							}
							onClick={() => setMode(expanded ? "docked" : "expanded")}
							size="icon"
							title={expanded ? "Collapse" : "Expand"}
							variant="skeleton"
						/>
						<IconButton
							className="cursor-pointer"
							icon={<XIcon size={12} />}
							onClick={closePanel}
							size="icon"
							title="Close"
							variant="skeleton"
						/>
					</div>
				</div>
				<LeafChatContainer
					contentClassName={expanded ? "mx-auto w-full max-w-3xl" : undefined}
					key={threadId}
					threadId={threadId}
				/>
			</div>
		</>,
		container,
	);
};

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
