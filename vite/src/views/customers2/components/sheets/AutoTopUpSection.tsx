import { BillingInterval } from "@autumn/shared";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import type { BalanceEditFormInstance } from "./useBalanceEditForm";

const RATE_LIMIT_INTERVALS = [
	{ value: BillingInterval.Week, label: "Week" },
	{ value: BillingInterval.Month, label: "Month" },
	{ value: BillingInterval.Quarter, label: "Quarter" },
	{ value: BillingInterval.SemiAnnual, label: "Semi-Annual" },
	{ value: BillingInterval.Year, label: "Year" },
];

export function AutoTopUpSection({ form }: { form: BalanceEditFormInstance }) {
	return (
		<div className="flex flex-col gap-3">
			<form.AppField name="autoTopUp.enabled">
				{(field) => (
					<field.AreaCheckboxField
						title="Auto Top-Up"
						description="Automatically purchase more credits when balance drops below a threshold."
					/>
				)}
			</form.AppField>

			<form.Field name="autoTopUp.enabled">
				{(enabledField) =>
					enabledField.state.value && (
						<>
							<div className="grid grid-cols-2 gap-3">
								<form.AppField name="autoTopUp.threshold">
									{(field) => (
										<field.NumberField
											label="Threshold"
											description="Balance level that triggers a top-up"
											placeholder="e.g. 10"
											min={0}
											float
										/>
									)}
								</form.AppField>
								<form.AppField name="autoTopUp.quantity">
									{(field) => (
										<field.NumberField
											label="Quantity"
											description="Credits added per top-up"
											placeholder="e.g. 100"
											min={1}
											float
										/>
									)}
								</form.AppField>
							</div>

							<form.AppField name="autoTopUp.maxPurchasesEnabled">
								{(field) => (
									<field.AreaCheckboxField
										title="Rate Limit"
										description="Limit how many auto top-ups can occur in a given interval."
									/>
								)}
							</form.AppField>

							<form.Field name="autoTopUp.maxPurchasesEnabled">
								{(maxField) =>
									maxField.state.value && (
										<div className="grid grid-cols-2 gap-3">
											<form.Field name="autoTopUp.interval">
												{(field) => (
													<div>
														<div className="text-form-label block mb-1">
															Interval
														</div>
														<p className="text-t3 text-xs mb-1">
															Rate limit reset period
														</p>
														<Select
															value={field.state.value}
															onValueChange={(v) =>
																field.handleChange(v as BillingInterval)
															}
														>
															<SelectTrigger className="w-full">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																{RATE_LIMIT_INTERVALS.map((opt) => (
																	<SelectItem key={opt.value} value={opt.value}>
																		{opt.label}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</div>
												)}
											</form.Field>
											<form.AppField name="autoTopUp.maxPurchases">
												{(field) => (
													<field.NumberField
														label="Max Purchases"
														description="Top-ups allowed per interval"
														placeholder="e.g. 5"
														min={1}
													/>
												)}
											</form.AppField>
										</div>
									)
								}
							</form.Field>
						</>
					)
				}
			</form.Field>
		</div>
	);
}
