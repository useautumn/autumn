import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { ClockCounterClockwiseIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useLeafPanelStore } from "@/hooks/stores/useLeafPanelStore";
import { cn } from "@/lib/utils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useLeafThreadsQuery } from "../hooks/useLeafThreadsQuery";

/** History dropdown in the Leaf panel header: the user's last ~10 chats. */
export const LeafThreadHistory = () => {
	const [open, setOpen] = useState(false);
	const { threads, threadsError, threadsLoading } = useLeafThreadsQuery({
		enabled: open,
	});
	const activeThreadId = useLeafPanelStore((s) => s.threadId);
	const openThread = useLeafPanelStore((s) => s.openThread);
	const newThread = useLeafPanelStore((s) => s.newThread);
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();
	const axiosInstance = useAxiosInstance();

	const { mutate: clearAll, isPending: clearing } = useMutation({
		mutationFn: () => axiosInstance.delete("/agent/chat/threads"),
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to clear chats"));
		},
		onSuccess: () => {
			// Write the empty list directly — invalidate alone leaves the old list
			// visible (stale-while-refetch) if the dropdown reopens immediately.
			queryClient.setQueryData(buildKey(["leaf-threads"]), { threads: [] });
			// The active thread's server history is gone too — start clean.
			newThread();
		},
	});

	const resumeThread = (threadId: string) => {
		if (threadId === activeThreadId) return;
		// The thread cache hydrates once with Infinity staleTime — drop it so a
		// resume always reflects turns sent since it was last cached.
		queryClient.removeQueries({
			queryKey: buildKey(["leaf-thread", threadId]),
		});
		openThread(threadId);
	};

	return (
		<DropdownMenu onOpenChange={setOpen} open={open}>
			<DropdownMenuTrigger asChild>
				<IconButton
					className="cursor-pointer"
					icon={<ClockCounterClockwiseIcon size={12} />}
					size="icon"
					title="Chat history"
					variant="skeleton"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				{threads.length === 0 && (
					<div className="px-2 py-1.5 text-tertiary-foreground text-xs">
						{threadsLoading
							? "Loading…"
							: threadsError
								? "Couldn't load chats — try again"
								: "No previous chats"}
					</div>
				)}
				{threads.map((thread) => (
					<DropdownMenuItem
						className="cursor-pointer gap-2"
						key={thread.id}
						onClick={() => resumeThread(thread.id)}
					>
						<span
							className={cn(
								"min-w-0 flex-1 truncate",
								thread.id === activeThreadId && "font-medium text-foreground",
							)}
						>
							{thread.title ?? "Untitled chat"}
						</span>
						<span className="shrink-0 text-[10px] text-tertiary-foreground">
							{formatDistanceToNowStrict(thread.updatedAt, { addSuffix: true })}
						</span>
					</DropdownMenuItem>
				))}
				{threads.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="cursor-pointer gap-2 text-red-600 focus:text-red-600 dark:text-red-500 dark:focus:text-red-500"
							disabled={clearing}
							onClick={() => clearAll()}
						>
							<TrashIcon size={13} />
							Clear all
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
