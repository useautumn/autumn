import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@autumn/ui";
import { useMemo } from "react";
import {
	CodeGroup,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { VirtualizedJson } from "@/components/v2/VirtualizedJson";

export function MigrationObjectSheet({
	open,
	onOpenChange,
	value,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	value: unknown;
}) {
	const formattedJson = useMemo(() => JSON.stringify(value, null, 2), [value]);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden bg-background sm:min-w-xl">
				<SheetHeader>
					<SheetTitle>Migration Object</SheetTitle>
					<p className="text-tertiary-foreground text-sm">
						Current filter and operations
					</p>
				</SheetHeader>

				<div className="flex-1 overflow-hidden flex flex-col px-4 pb-4">
					<CodeGroup value="migration" className="flex-1 h-0 flex flex-col">
						<CodeGroupList>
							<CodeGroupTab value="migration">Migration</CodeGroupTab>
							<CodeGroupCopyButton
								onCopy={() => navigator.clipboard.writeText(formattedJson)}
							/>
						</CodeGroupList>
						<VirtualizedJson
							json={formattedJson}
							className="flex-1 h-0 border border-t-0 rounded-b-lg bg-white dark:bg-background py-4"
						/>
					</CodeGroup>
				</div>
			</SheetContent>
		</Sheet>
	);
}
