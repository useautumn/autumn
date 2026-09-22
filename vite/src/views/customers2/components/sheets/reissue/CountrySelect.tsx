import { SearchableSelect } from "@autumn/ui";
import { ISO_COUNTRY_CODES } from "./isoCountryCodes";

const flagOf = (code: string) =>
	code
		.toUpperCase()
		.split("")
		.map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
		.join("");

const names = new Intl.DisplayNames(["en"], { type: "region" });
export const COUNTRIES = ISO_COUNTRY_CODES.map((code) => ({
	code,
	name: names.of(code) ?? code,
	flag: flagOf(code),
})).sort((a, b) => a.name.localeCompare(b.name));

export function CountrySelect({
	value,
	onValueChange,
}: {
	value: string;
	onValueChange: (code: string) => void;
}) {
	return (
		<SearchableSelect
			value={value || null}
			onValueChange={onValueChange}
			options={COUNTRIES}
			getOptionValue={(option) => option.code}
			getOptionLabel={(option) => option.name}
			getOptionSearchTerms={(option) => [option.code]}
			placeholder="Country"
			renderValue={(option) =>
				option ? (
					<span className="flex items-center gap-2">
						<span>{option.flag}</span>
						<span>{option.name}</span>
					</span>
				) : (
					<span className="text-tertiary-foreground">Country</span>
				)
			}
			renderOption={(option) => (
				<span className="flex items-center gap-2">
					<span>{option.flag}</span>
					<span>{option.name}</span>
				</span>
			)}
			searchable
			searchPlaceholder="Search countries"
			triggerClassName="w-full"
		/>
	);
}
