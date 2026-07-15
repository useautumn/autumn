import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	Switch,
} from "@autumn/ui";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { FreeTrialConfigRow } from "@/components/forms/shared/FreeTrialConfigRow";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { AttachCurrencyRow } from "./AttachCurrencyRow";

export function AttachPlanOptions() {
	const {
		form,
		formValues,
		numVersions,
		product,
		handleGrantFreeToggle,
		hasActiveSubscription,
		attachCurrency,
	} = useAttachFormContext();
	const { trialEnabled, trialCardRequired, trialOnEnd, grantFree } = formValues;
	const [versionOpen, setVersionOpen] = useState(false);

	const showVersionSelector = numVersions > 1;
	const handleTrialOnEndChange = hasActiveSubscription
		? (value: "bill" | "revert") => form.setFieldValue("trialOnEnd", value)
		: undefined;

	return (
		<div className="flex flex-col gap-4">
			{showVersionSelector && (
				<ConfigRow
					title="Plan Version"
					description="Select which version of the plan to attach"
					action={
						<form.AppField name="version">
							{(field) => {
								const selectedVersion =
									field.state.value ?? product?.version ?? numVersions;
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
												<CaretDownIcon className="size-3.5 text-tertiary-foreground" />
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

			{attachCurrency.showCurrencySelector && <AttachCurrencyRow />}

			<FreeTrialConfigRow
				form={form}
				expanded={!!trialEnabled}
				checked={!!trialEnabled}
				trialCardRequired={!!trialCardRequired}
				trialOnEnd={trialOnEnd}
				onTrialOnEndChange={handleTrialOnEndChange}
				onToggle={(enabled) => {
					form.setFieldValue("trialEnabled", enabled);
					if (enabled) {
						if (!formValues.trialLength) {
							const productTrial = product?.free_trial;
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
					} else {
						form.setFieldValue("trialLength", null);
					}
				}}
			/>

			<ConfigRow
				title="Grant for Free"
				description="Remove all prices on this plan for this customer"
				action={
					<Switch
						checked={!!grantFree}
						onCheckedChange={(enabled) => handleGrantFreeToggle({ enabled })}
					/>
				}
			/>
		</div>
	);
}
