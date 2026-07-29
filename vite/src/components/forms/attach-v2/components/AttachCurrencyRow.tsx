import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { cn } from "@/lib/utils";
import { useAttachFormContext } from "../context/AttachFormProvider";

export function AttachCurrencyRow() {
	const { form, attachCurrency } = useAttachFormContext();
	const { orgDefaultCurrency, currencyOptions } = attachCurrency;
	const [open, setOpen] = useState(false);

	const orgDefaultCode = orgDefaultCurrency.toLowerCase();

	return (
		<ConfigRow
			title="Currency"
			description="Bill this customer in one of the plan's configured currencies"
			action={
				<form.AppField name="currency">
					{(field) => {
						const selectedCode = (
							field.state.value ?? orgDefaultCode
						).toLowerCase();

						return (
							<DropdownMenu open={open} onOpenChange={setOpen}>
								<DropdownMenuTrigger asChild>
									<Button
										variant="secondary"
										size="mini"
										className={cn("gap-1", open && "btn-secondary-active")}
									>
										{selectedCode.toUpperCase()}
										<CaretDownIcon className="size-3.5 text-tertiary-foreground" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{currencyOptions.map((code) => (
										<DropdownMenuItem
											key={code}
											onClick={() =>
												field.handleChange(
													code === orgDefaultCode ? null : code,
												)
											}
											className="flex gap-3"
										>
											<CheckIcon
												size={12}
												className={
													selectedCode === code ? "opacity-100" : "opacity-0"
												}
											/>
											{code.toUpperCase()}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						);
					}}
				</form.AppField>
			}
		/>
	);
}
