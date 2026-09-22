import { SearchableSelect } from "@autumn/ui";

const flagOf = (code: string) =>
	code
		.toUpperCase()
		.split("")
		.map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
		.join("");

// ISO 3166-1 alpha-2 codes Stripe lets you set on a customer address, named by the browser.
const ALL_CODES = Array.from({ length: 26 * 26 }, (_, index) =>
	String.fromCharCode(65 + Math.floor(index / 26), 65 + (index % 26)),
);

const names = new Intl.DisplayNames(["en"], { type: "region" });
const COUNTRIES = ALL_CODES.flatMap((code) => {
	const name = names.of(code);
	return name && name !== code ? [{ code, name, flag: flagOf(code) }] : [];
}).sort((a, b) => a.name.localeCompare(b.name));

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
