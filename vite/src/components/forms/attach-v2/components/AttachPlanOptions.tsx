import type { FreeTrialDuration } from "@autumn/shared";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { TRIAL_DURATION_OPTIONS } from "@/components/forms/update-subscription-v2/constants/trialConstants";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/v2/buttons/Button";
import { TextCheckbox } from "@/components/v2/checkboxes/TextCheckbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";

const EXPAND_TRANSITION = {
	duration: 0.2,
	ease: [0.32, 0.72, 0, 1] as const,
};

function OptionRow({
	title,
	description,
	enabled,
	onToggle,
	children,
}: {
	title: string;
	description: string;
	enabled: boolean;
	onToggle: (enabled: boolean) => void;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-3">
				<div className="flex flex-col gap-0.5 min-w-0">
					<span className="text-sm font-medium text-t1">{title}</span>
					<span className="text-xs text-t3">{description}</span>
				</div>
				<Switch checked={enabled} onCheckedChange={onToggle} />
			</div>
			<AnimatePresence initial={false}>
				{enabled && children && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{
							height: "auto",
							opacity: 1,
							transition: {
								height: EXPAND_TRANSITION,
								opacity: { duration: 0.15, delay: 0.05 },
							},
						}}
						exit={{
							height: 0,
							opacity: 0,
							transition: {
								opacity: { duration: 0.1 },
								height: { ...EXPAND_TRANSITION, delay: 0.05 },
							},
						}}
						className="overflow-hidden"
					>
						{children}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export function AttachPlanOptions() {
	const { form, formValues, numVersions, product } = useAttachFormContext();
	const { trialEnabled, trialCardRequired, grantFree } = formValues as Record<
		string,
		// biome-ignore lint/suspicious/noExplicitAny: form values are typed through the schema
		any
	>;
	const [versionOpen, setVersionOpen] = useState(false);

	const showVersionSelector = numVersions > 1;

	return (
		<div className="flex flex-col gap-4">
			{showVersionSelector && (
				<div className="flex items-center justify-between gap-3">
					<div className="flex flex-col gap-0.5 min-w-0">
						<span className="text-sm font-medium text-t1">Plan Version</span>
						<span className="text-xs text-t3">
							Select which version of the plan to attach
						</span>
					</div>
					<form.AppField name="version">
						{(field) => {
							const selectedVersion =
								field.state.value ?? product?.version ?? numVersions;
							return (
								<DropdownMenu open={versionOpen} onOpenChange={setVersionOpen}>
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
				</div>
			)}

			<OptionRow
				title="Free Trial"
				description="Let the customer try the plan before being charged"
				enabled={!!trialEnabled}
				onToggle={(enabled) => {
					form.setFieldValue("trialEnabled", enabled);
					if (!enabled) {
						form.setFieldValue("trialLength", null);
					}
				}}
			>
				<div className="flex items-center gap-2">
					<form.AppField name="trialLength">
						{(field) => (
							<field.NumberField
								label=""
								placeholder="7"
								min={1}
								className="w-20"
								inputClassName="placeholder:opacity-50"
								hideFieldInfo
							/>
						)}
					</form.AppField>
					<form.AppField name="trialDuration">
						{(field) => (
							<field.SelectField
								label=""
								placeholder="Days"
								options={
									TRIAL_DURATION_OPTIONS as unknown as {
										label: string;
										value: FreeTrialDuration;
									}[]
								}
								className="w-28"
								hideFieldInfo
							/>
						)}
					</form.AppField>
					<div className="mx-2">
						<TextCheckbox
							checked={!!trialCardRequired}
							onCheckedChange={(checked) =>
								form.setFieldValue("trialCardRequired", checked as boolean)
							}
						>
							Card Required
						</TextCheckbox>
					</div>
				</div>
			</OptionRow>

			<OptionRow
				title="Grant for Free"
				description="Remove all prices on this plan for this customer"
				enabled={!!grantFree}
				onToggle={(enabled) => {
					form.setFieldValue("grantFree" as never, enabled as never);
				}}
			/>
		</div>
	);
}
