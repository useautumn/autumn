import {
	IconButton,
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@autumn/ui";
import {
	ArrowClockwiseIcon,
	TerminalWindowIcon,
	XIcon,
} from "@phosphor-icons/react";
import { Drawer as DrawerPrimitive } from "vaul";
import { useCusRequestLogsQuery } from "@/hooks/queries/useCusRequestLogsQuery";
import { useWorkbenchStore } from "@/hooks/stores/useWorkbenchStore";
import { cn } from "@/lib/utils";
import { useCustomerContext } from "../CustomerContext";
import { useWorkbenchEscape } from "./hooks/useWorkbenchEscape";
import { useWorkbenchResize } from "./hooks/useWorkbenchResize";
import { WorkbenchFilters } from "./WorkbenchFilters";
import { WorkbenchLogDetail } from "./WorkbenchLogDetail";
import { WorkbenchLogList } from "./WorkbenchLogList";

export const Workbench = () => {
	const { customer } = useCustomerContext();
	const isOpen = useWorkbenchStore((s) => s.isOpen);
	const height = useWorkbenchStore((s) => s.height);
	const close = useWorkbenchStore((s) => s.close);

	const { handleProps } = useWorkbenchResize();
	useWorkbenchEscape();

	const { refetch, isFetching } = useCusRequestLogsQuery({
		customerId: customer?.id,
		enabled: isOpen,
	});

	return (
		<DrawerPrimitive.Root
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) close();
			}}
			modal={false}
			dismissible={false}
			autoFocus={false}
			repositionInputs={false}
			noBodyStyles
		>
			<DrawerPrimitive.Portal>
				<DrawerPrimitive.Content
					style={{ height: `${height}px` }}
					className={cn(
						"fixed inset-x-0 bottom-0 z-[40] flex flex-col bg-card border-t border-border outline-none shadow-2xl",
						"focus:outline-none",
					)}
				>
					<DrawerPrimitive.Title className="sr-only">
						Workbench
					</DrawerPrimitive.Title>

					<WorkbenchHeader
						onRefresh={() => refetch()}
						isFetching={isFetching}
						onClose={close}
						handleProps={handleProps}
					/>

					<div className="flex-1 min-h-0 overflow-hidden">
						<ResizablePanelGroup direction="horizontal">
							<ResizablePanel
								defaultSize={42}
								minSize={25}
								className="!flex flex-col min-h-0"
							>
								<WorkbenchLogList customerId={customer?.id} isOpen={isOpen} />
							</ResizablePanel>
							<ResizableHandle className="!w-px bg-border hover:bg-subtle transition-colors cursor-col-resize after:!w-2 after:cursor-col-resize" />
							<ResizablePanel
								defaultSize={58}
								minSize={35}
								className="!flex flex-col min-h-0"
							>
								<WorkbenchLogDetail customerId={customer?.id} isOpen={isOpen} />
							</ResizablePanel>
						</ResizablePanelGroup>
					</div>
				</DrawerPrimitive.Content>
			</DrawerPrimitive.Portal>
		</DrawerPrimitive.Root>
	);
};

type ResizeHandleProps = ReturnType<typeof useWorkbenchResize>["handleProps"];

const WorkbenchHeader = ({
	onRefresh,
	isFetching,
	onClose,
	handleProps,
}: {
	onRefresh: () => void;
	isFetching: boolean;
	onClose: () => void;
	handleProps: ResizeHandleProps;
}) => (
	<div className="relative flex items-center justify-between px-3 h-9 border-b border-border shrink-0">
		<button
			type="button"
			{...handleProps}
			aria-label="Resize workbench"
			className="absolute -top-1 inset-x-0 h-2 cursor-row-resize group z-10 bg-transparent border-0 p-0"
		>
			<div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-border group-hover:bg-subtle transition-colors" />
		</button>

		<div className="flex items-center gap-2 min-w-0">
			<div className="flex items-center gap-1.5 text-foreground text-xs font-semibold shrink-0">
				<TerminalWindowIcon size={13} weight="fill" />
				Workbench
			</div>
			<div className="h-3 w-px bg-border shrink-0" />
			<div className="text-xs text-foreground font-medium px-1.5 py-0.5 rounded bg-interactive-secondary shrink-0">
				Logs
			</div>
		</div>

		<div className="flex items-center gap-2 shrink-0">
			<WorkbenchFilters />
			<div className="h-3 w-px bg-border" />
			<IconButton
				variant="skeleton"
				size="icon"
				onClick={onRefresh}
				icon={
					<ArrowClockwiseIcon
						size={12}
						className={cn(isFetching && "animate-spin")}
					/>
				}
				title="Refresh"
				className="cursor-pointer"
			/>
			<IconButton
				variant="skeleton"
				size="icon"
				onClick={onClose}
				icon={<XIcon size={12} />}
				title="Close"
				className="cursor-pointer"
			/>
		</div>
	</div>
);
