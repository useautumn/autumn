import { CustomerExportKind } from "@autumn/shared";
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
import { CustomerExportDryRunToggle } from "./CustomerExportDryRunToggle";
import { CustomerExportFieldSelector } from "./CustomerExportFieldSelector";
import { CustomerExportFilterScope } from "./CustomerExportFilterScope";
import { CustomerExportJobList } from "./CustomerExportJobList";
import { CustomerExportOverview } from "./CustomerExportOverview";
import { CustomerExportUnlinkedStripeToggle } from "./CustomerExportUnlinkedStripeToggle";
import { CUSTOMER_EXPORT_SHEET_COPY } from "./customerExportSheetCopy";
import {
	type CustomerExportSheetProps,
	useCustomerExportSheet,
} from "./useCustomerExportSheet";

export function CustomerExportSheet({
	kind,
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
		isExportCountApproximate,
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
	} = useCustomerExportSheet({ kind, open, onOpenChange });
	const copy = CUSTOMER_EXPORT_SHEET_COPY[kind];

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden md:max-w-[540px]">
				<LayoutGroup>
					<div className="flex h-full flex-col overflow-hidden">
						<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
							<SheetHeader title={copy.title} description={copy.description} />

							<SheetSection title="Generate new export">
								<div className="flex flex-col gap-3">
									<form.Field name="fields">
										{(field) => (
											<CustomerExportOverview
												exportTotalCount={exportTotalCount}
												isCountApproximate={isExportCountApproximate}
												isCountLoading={isExportCountLoading}
												isFilteredExport={isFilteredExport}
												columnsAction={
													kind === CustomerExportKind.Customers ? (
														<CustomerExportFieldSelector
															selectedFields={field.state.value}
															onChange={(fields) => field.handleChange(fields)}
														/>
													) : (
														<span className="text-tertiary-foreground">
															{copy.columnsSummary}
														</span>
													)
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
											>
												{kind === CustomerExportKind.BillingVerify ? (
													<form.Field name="includeUnlinkedStripeCustomers">
														{(unlinkedField) => (
															<CustomerExportUnlinkedStripeToggle
																includeUnlinkedStripeCustomers={
																	unlinkedField.state.value
																}
																onIncludeUnlinkedStripeCustomersChange={
																	unlinkedField.handleChange
																}
															/>
														)}
													</form.Field>
												) : null}
												{kind === CustomerExportKind.CustomPlans ? (
													<form.Field name="dryRun">
														{(dryRunField) => (
															<CustomerExportDryRunToggle
																dryRun={dryRunField.state.value}
																onDryRunChange={dryRunField.handleChange}
															/>
														)}
													</form.Field>
												) : null}
											</CustomerExportOverview>
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
									kind={kind}
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
							<CustomerExportActiveProgress
								activeExport={activeExport}
								scanningLabel={copy.scanningLabel}
								runningLabel={copy.runningLabel}
							/>

							<form.Subscribe
								selector={(state) => ({
									canSubmit: state.canSubmit,
									isApplyRun:
										kind === CustomerExportKind.CustomPlans &&
										!state.values.dryRun,
								})}
							>
								{({ canSubmit, isApplyRun }) => (
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
												{isApplyRun ? copy.applySubmitLabel : copy.submitLabel}
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
