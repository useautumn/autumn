import {
	ConditionalTooltip,
	Sheet,
	SheetContent,
	ShortcutButton,
} from "@autumn/ui";
import {
	ClockCounterClockwiseIcon,
	FilePlusIcon,
	type Icon,
} from "@phosphor-icons/react";
import {
	LayoutGroup,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { CustomerExportFieldSelector } from "./CustomerExportFieldSelector";
import { CustomerExportFilterScope } from "./CustomerExportFilterScope";
import { CustomerExportOverview } from "./CustomerExportOverview";
import { LiveCustomerExportJobList } from "./LiveCustomerExportJobList";
import {
	type CustomerExportSheetProps,
	useCustomerExportSheet,
} from "./useCustomerExportSheet";

function SectionTitle({
	icon: TitleIcon,
	label,
}: {
	icon: Icon;
	label: string;
}) {
	return (
		<span className="flex items-center gap-2">
			<TitleIcon size={16} weight="fill" className="text-subtle" />
			{label}
		</span>
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
		exportTotalCount,
		form,
		handleOpenChange,
		hasActiveFilters,
		hasFilters,
		invalidateExports,
		isExportCountLoading,
		isExportsInitialError,
		isExportsLoading,
		isExportsRetrying,
		isFilteredExport,
		submitBlockedReason,
		refetchExports,
		setIsRealtimeDegraded,
		trimmedSearch,
	} = useCustomerExportSheet({ open, onOpenChange });

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden md:max-w-[540px]">
				<LayoutGroup>
					<div className="flex h-full flex-col overflow-hidden">
						<div className="flex min-h-0 flex-1 flex-col">
							<SheetHeader
								title="Export customers"
								description="Download your customer list as a CSV file."
							/>

							<SheetSection
								title={
									<SectionTitle
										icon={FilePlusIcon}
										label="Generate new export"
									/>
								}
							>
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

									<div className="border-border/40 border-t pt-3">
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
							</SheetSection>

							<SheetSection
								title={
									<SectionTitle
										icon={ClockCounterClockwiseIcon}
										label="Recent exports"
									/>
								}
								withSeparator={false}
								className="flex min-h-0 flex-1 flex-col"
							>
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
					</div>
				</LayoutGroup>
			</SheetContent>
		</Sheet>
	);
}
