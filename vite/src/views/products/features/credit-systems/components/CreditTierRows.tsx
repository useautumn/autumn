import { IconButton, Input } from "@autumn/ui";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import {
	addTier,
	type GraduatedCreditRate,
	removeTier,
	updateTier,
} from "../utils/creditSchemaUtils";
import { CreditNumberInput } from "./CreditNumberInput";

interface CreditTierRowsProps<T extends GraduatedCreditRate> {
	item: T;
	onChange: (item: T) => void;
}

export function CreditTierRows<T extends GraduatedCreditRate>({
	item,
	onChange,
}: CreditTierRowsProps<T>) {
	const { tiers } = item;

	return (
		<div className="flex flex-col gap-2">
			{tiers.map((tier, index) => {
				const isLast = index === tiers.length - 1;

				return (
					<div key={`tier-${index}`} className="flex items-center gap-2 w-full">
						<span className="text-tertiary-foreground text-xs shrink-0 w-18">
							{index === 0 ? "first" : "then, up to"}
						</span>

						{isLast ? (
							<Input
								aria-label={`Tier ${index + 1} upper boundary`}
								value=""
								placeholder="∞"
								disabled
								className="w-full"
							/>
						) : (
							<CreditNumberInput
								ariaLabel={`Tier ${index + 1} upper boundary`}
								className="w-full"
								placeholder="eg. 10000"
								value={typeof tier.to === "number" ? tier.to : undefined}
								onValueChange={(to) =>
									onChange(updateTier({ item, index, patch: { to } }))
								}
							/>
						)}

						<CreditNumberInput
							ariaLabel={`Tier ${index + 1} credit cost`}
							className="w-26 shrink-0"
							placeholder="eg. 1"
							value={tier.credit_amount}
							onValueChange={(credit_amount) =>
								onChange(updateTier({ item, index, patch: { credit_amount } }))
							}
						/>

						<IconButton
							aria-label={`Remove tier ${index + 1}`}
							type="button"
							variant="muted"
							className="p-1 shrink-0 text-tertiary-foreground hover:text-red-500"
							icon={<TrashIcon size={10} />}
							onClick={() => onChange(removeTier({ item, index }))}
						/>
					</div>
				);
			})}

			<IconButton
				type="button"
				variant="muted"
				size="sm"
				className="w-full text-tertiary-foreground text-xs"
				icon={<PlusIcon size={10} />}
				onClick={() => onChange(addTier(item))}
			>
				Add Tier
			</IconButton>
		</div>
	);
}
