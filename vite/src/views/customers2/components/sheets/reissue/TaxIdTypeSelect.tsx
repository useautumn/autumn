import { STRIPE_TAX_ID_OPTIONS, type StripeTaxIdOption } from "@autumn/shared";
import { SearchableSelect } from "@autumn/ui";

const firstOfCountry = (index: number) =>
	index === 0 ||
	STRIPE_TAX_ID_OPTIONS[index - 1].countryCode !==
		STRIPE_TAX_ID_OPTIONS[index].countryCode;

const optionIndex = new Map(
	STRIPE_TAX_ID_OPTIONS.map((option, index) => [option.id, index]),
);

/** Flat list of every Stripe tax id type, grouped visually by country. */
export function TaxIdTypeSelect({
	value,
	onValueChange,
}: {
	value: string | null;
	onValueChange: (id: string) => void;
}) {
	return (
		<SearchableSelect
			value={value}
			onValueChange={onValueChange}
			options={STRIPE_TAX_ID_OPTIONS}
			getOptionValue={(option) => option.id}
			getOptionLabel={(option) => `${option.country} ${option.label}`}
			getOptionSearchTerms={(option) => [option.type, option.countryCode]}
			placeholder="Registration type"
			renderValue={(option: StripeTaxIdOption | undefined) =>
				option ? (
					<span className="flex items-center gap-2 truncate">
						<span>{option.flag}</span>
						<span>{option.country}</span>
						<span className="truncate text-tertiary-foreground">
							{option.label}
						</span>
					</span>
				) : (
					<span className="text-tertiary-foreground">Registration type</span>
				)
			}
			renderOption={(option) => {
				const showCountry = firstOfCountry(optionIndex.get(option.id) ?? 0);
				return (
					<span className="flex w-full items-center gap-2">
						<span className={showCountry ? "" : "invisible"}>
							{option.flag}
						</span>
						<span
							className={`w-32 shrink-0 truncate ${showCountry ? "" : "invisible"}`}
						>
							{option.country}
						</span>
						<span className="flex-1 truncate text-sm">{option.label}</span>
					</span>
				);
			}}
			searchable
			searchPlaceholder="Search by country or type"
			triggerClassName="w-56 shrink-0"
			contentClassName="w-[28rem]"
		/>
	);
}
