import {
	ConditionalTooltip,
	Sheet,
	SheetContent,
	ShortcutButton,
} from "@autumn/ui";
import {
	LayoutGroup,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { CustomerExportActiveProgress } from "./CustomerExportActiveProgress";
import { CustomerExportFieldSelector } from "./CustomerExportFieldSelector";
import { CustomerExportFilterScope } from "./CustomerExportFilterScope";
import { CustomerExportJobList } from "./CustomerExportJobList";
import { CustomerExportOverview } from "./CustomerExportOverview";
import {
	type CustomerExportSheetProps,
	useCustomerExportSheet,
} from "./useCustomerExportSheet";

export function CustomerExportSheet({
	open,
	onOpenChange,
}: CustomerExportSheetProps) {
	const {
		activeExport,
		createExport,
		customerExports,
		exportTotalCount,
		form,
		handleOpenChange,
		hasActiveFilters,
		hasFilters,
		isExportCountLoading,
		isExportsInitialError,
		isExportsLoading,
		isExportsRetrying,
		isFilteredExport,
		submitBlockedReason,
		refetchExports,
		trimmedSearch,
		page,
		setPage,
		totalExports,
		totalPages,
	} = useCustomerExportSheet({ open, onOpenChange });

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden md:max-w-[540px]">
				<LayoutGroup>
					<div className="flex h-full flex-col overflow-hidden">
						<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
							<SheetHeader
								title="Export customers"
								description="Download your customer list as a CSV file."
							/>

							<SheetSection title="Generate new export">
								<div className="flex flex-col gap-3">
									<form.Field name="fields">
										{(field) => (
											<CustomerExportOverview
												exportTotalCount={exportTotalCount}
												isCountLoading={isExportCountLoading}
												isFilteredExport={isFilteredExport}
												columnsAction={
													<CustomerExportFieldSelector
														selectedFields={field.state.value}
														onChange={(fields) => field.handleChange(fields)}
													/>
												}
												scopeRow={
													hasFilters ? (
														<form.Field name="restrictToCurrentFilters">
															{(scopeField) => (
																<CustomerExportFilterScope
																	searchText={trimmedSearch}
																	hasActiveFilters={hasActiveFilters}
																	restrictToCurrentFilters={
																		scopeField.state.value
																	}
																	onRestrictToCurrentFiltersChange={
																		scopeField.handleChange
																	}
																/>
															)}
														</form.Field>
													) : null
												}
											/>
										)}
									</form.Field>
								</div>
							</SheetSection>

							<SheetSection
								title="Recent exports"
								withSeparator={false}
								className="flex min-h-0 flex-col"
							>
								<CustomerExportJobList
									customerExports={customerExports}
									isLoading={isExportsLoading}
									isInitialError={isExportsInitialError}
									isRetrying={isExportsRetrying}
									onRetry={refetchExports}
									page={page}
									totalPages={totalPages}
									totalExports={totalExports}
									onPageChange={setPage}
								/>
							</SheetSection>
						</div>

						<div className="border-border/40 border-t px-4 pt-3 pb-4">
							<CustomerExportActiveProgress activeExport={activeExport} />

							<form.Subscribe selector={(state) => state.canSubmit}>
								{(canSubmit) => (
									<ConditionalTooltip
										enabled={Boolean(submitBlockedReason)}
										content={submitBlockedReason}
									>
										{/* Wrap in span so Radix can attach listeners even when the button is disabled. */}
										<span className="inline-flex w-full">
											<ShortcutButton
												variant="primary"
												className="w-full"
												onClick={() => form.handleSubmit()}
												isLoading={createExport.isPending}
												disabled={
													!canSubmit ||
													Boolean(submitBlockedReason) ||
													isExportCountLoading ||
													isExportsLoading
												}
												metaShortcut="enter"
											>
												Start export
											</ShortcutButton>
										</span>
									</ConditionalTooltip>
								)}
							</form.Subscribe>
						</div>
					</div>
				</LayoutGroup>
			</SheetContent>
		</Sheet>
	);
}
