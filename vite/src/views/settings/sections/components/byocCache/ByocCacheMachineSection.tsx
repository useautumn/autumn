import type { ApiByocCache } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { CpuIcon } from "@phosphor-icons/react";
import { ByocCacheMachineTable } from "./ByocCacheMachineTable";
import { BYOC_CACHE_RESIZE_NOTE } from "./byocCacheMachineDisplay";
import { ResizeByocCacheDialog } from "./ResizeByocCacheDialog";
import type { useByocCacheActions } from "./useByocCacheActions";
import { useByocCacheMachineForm } from "./useByocCacheMachineForm";

export const ByocCacheMachineSection = ({
	cache,
	resize,
}: {
	cache: ApiByocCache;
	resize: ReturnType<typeof useByocCacheActions>["resize"];
}) => {
	const {
		form,
		current,
		selected,
		isUnchanged,
		selectMachine,
		isConfirmOpen,
		setConfirmOpen,
		confirmResize,
	} = useByocCacheMachineForm({ cache, resize });

	return (
		<>
			<form
				className="flex flex-col gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
			>
				<div className="flex items-center gap-2 px-2 text-[15px] text-muted-foreground">
					<CpuIcon className="size-4 text-subtle" />
					Machine size
				</div>
				<ByocCacheMachineTable
					selected={selected}
					current={current}
					onSelect={selectMachine}
					disabled={resize.isPending}
				/>
				<div className="flex items-center justify-between gap-4">
					<p className="max-w-[420px] text-xs text-tertiary-foreground">
						{BYOC_CACHE_RESIZE_NOTE}
					</p>
					<div className="flex shrink-0 gap-2">
						<Button
							type="button"
							variant="secondary"
							disabled={isUnchanged}
							onClick={() => form.reset()}
						>
							Cancel
						</Button>
						<Button type="submit" variant="primary" disabled={isUnchanged}>
							Resize
						</Button>
					</div>
				</div>
			</form>
			<ResizeByocCacheDialog
				open={isConfirmOpen}
				onOpenChange={setConfirmOpen}
				current={current}
				target={selected}
				onConfirm={confirmResize}
			/>
		</>
	);
};
