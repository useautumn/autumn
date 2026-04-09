import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { FreeTrialConfigRow } from "@/components/forms/shared/FreeTrialConfigRow";
import { Button } from "@/components/v2/buttons/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { cn } from "@/lib/utils";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function UpdateSubscriptionPlanOptions() {
	const { form, formValues, formContext, trialState } =
		useUpdateSubscriptionFormContext();
	const { numVersions, currentVersion } = formContext;
	const { trialCardRequired } = formValues;
	const [versionOpen, setVersionOpen] = useState(false);

	const showVersionSelector = numVersions > 1;

	const trialExpanded = trialState.isTrialExpanded && !trialState.removeTrial;

	return (
		<SheetSection withSeparator>
			<div className="flex flex-col gap-4">
				{showVersionSelector && (
					<ConfigRow
						title="Plan Version"
						description="Select which version of the plan to use"
						action={
							<form.AppField name="version">
								{(field) => {
									const selectedVersion =
										field.state.value ?? currentVersion ?? numVersions;
									return (
										<DropdownMenu
											open={versionOpen}
											onOpenChange={setVersionOpen}
										>
											<DropdownMenuTrigger asChild>
												<Button
													variant="secondary"
													size="mini"
													className={cn(
														"gap-1",
														versionOpen && "btn-secondary-active",
													)}
												>
													Version {selectedVersion}
													<CaretDownIcon className="size-3.5 text-t3" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												{Array.from(
													{ length: numVersions },
													(_, index) => numVersions - index,
												).map((version) => (
													<DropdownMenuItem
														key={version}
														onClick={() => field.handleChange(version)}
														className="flex gap-3"
													>
														<CheckIcon
															size={12}
															className={
																selectedVersion === version
																	? "opacity-100"
																	: "opacity-0"
															}
														/>
														Version {version}
													</DropdownMenuItem>
												))}
											</DropdownMenuContent>
										</DropdownMenu>
									);
								}}
							</form.AppField>
						}
					/>
				)}

				<FreeTrialConfigRow
					form={form}
					expanded={trialExpanded}
					checked={trialExpanded}
					trialCardRequired={!!trialCardRequired}
					onToggle={(enabled) => {
						if (enabled) {
							trialState.handleToggleTrial();
							if (!trialState.isCurrentlyTrialing) {
								const productTrial = formContext.product?.free_trial;
								form.setFieldValue(
									"trialLength",
									productTrial
										? Number(productTrial.length)
										: FreeTrialConfigRow.DEFAULT_TRIAL_LENGTH,
								);
								if (productTrial?.duration) {
									form.setFieldValue("trialDuration", productTrial.duration);
								}
							}
						} else if (trialState.isCurrentlyTrialing) {
							trialState.handleEndTrial();
						} else {
							trialState.setIsTrialExpanded(false);
							form.setFieldValue("trialLength", null);
						}
					}}
				/>
			</div>
		</SheetSection>
	);
}
