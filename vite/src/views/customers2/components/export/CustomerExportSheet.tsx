import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import type { ReactNode } from "react";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { CustomerExportFieldSelector } from "./CustomerExportFieldSelector";
import { CustomerExportFilterScope } from "./CustomerExportFilterScope";
import { LiveCustomerExportJobList } from "./LiveCustomerExportJobList";
import {
	type CustomerExportSheetProps,
	useCustomerExportSheet,
} from "./useCustomerExportSheet";

/** `output` carries an implicit status role, so late notices are announced. */
function SheetNotice({ children }: { children: ReactNode }) {
	return (
		<output className="mx-4 mt-2 block rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 text-xs dark:text-amber-500">
			{children}
		</output>
	);
}

export function CustomerExportSheet({
	open,
	onOpenChange,
}: CustomerExportSheetProps) {
	const {
		activeExport,
		createExport,
		customerExports,
		emptyMessage,
		exportDescription,
		form,
		handleOpenChange,
		hasActiveFilters,
		hasFilters,
		hasNothingToExport,
		invalidateExports,
		isExportCountErrored,
		isExportCountLoading,
		isExportsInitialError,
		isExportsLoading,
		isExportsRetrying,
		refetchExports,
		setIsRealtimeDegraded,
		trimmedSearch,
	} = useCustomerExportSheet({ open, onOpenChange });

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden">
				<LayoutGroup>
					<div className="flex h-full flex-col overflow-hidden">
						<div className="flex flex-1 flex-col overflow-y-auto">
							<SheetHeader
								title="Export customers"
								description={exportDescription}
							/>

							{hasFilters ? (
								<SheetSection>
									<form.Field name="restrictToCurrentFilters">
										{(field) => (
											<CustomerExportFilterScope
												searchText={trimmedSearch}
												hasActiveFilters={hasActiveFilters}
												restrictToCurrentFilters={field.state.value}
												onRestrictToCurrentFiltersChange={field.handleChange}
											/>
										)}
									</form.Field>
								</SheetSection>
							) : null}

							<SheetSection>
								<form.Field name="fields">
									{(field) => (
										<CustomerExportFieldSelector
											selectedFields={field.state.value}
											onChange={(fields) => field.handleChange(fields)}
										/>
									)}
								</form.Field>
							</SheetSection>

							<SheetSection title="Recent exports" withSeparator={false}>
								<LiveCustomerExportJobList
									customerExports={customerExports}
									activeExport={activeExport}
									isLoading={isExportsLoading}
									isInitialError={isExportsInitialError}
									isRetrying={isExportsRetrying}
									onExportComplete={invalidateExports}
									onRetry={refetchExports}
									onRealtimeDegradedChange={setIsRealtimeDegraded}
								/>
							</SheetSection>
						</div>

						{activeExport ? (
							<SheetNotice>
								An export is already {activeExport.status}. Starting another one
								will be rejected until it finishes.
							</SheetNotice>
						) : null}

						{isExportCountErrored ? (
							<SheetNotice>
								Couldn&apos;t load customer counts. You can still start the
								export.
							</SheetNotice>
						) : null}

						{emptyMessage ? <SheetNotice>{emptyMessage}</SheetNotice> : null}

						<SheetFooter>
							<ShortcutButton
								variant="secondary"
								className="w-full"
								onClick={() => handleOpenChange(false)}
								singleShortcut="escape"
							>
								Cancel
							</ShortcutButton>
							<form.Subscribe selector={(state) => state.canSubmit}>
								{(canSubmit) => (
									<ShortcutButton
										variant="primary"
										className="w-full"
										onClick={() => form.handleSubmit()}
										isLoading={createExport.isPending}
										disabled={
											!canSubmit ||
											hasNothingToExport ||
											isExportCountLoading ||
											isExportsLoading
										}
										metaShortcut="enter"
									>
										Start export
									</ShortcutButton>
								)}
							</form.Subscribe>
						</SheetFooter>
					</div>
				</LayoutGroup>
			</SheetContent>
		</Sheet>
	);
}
