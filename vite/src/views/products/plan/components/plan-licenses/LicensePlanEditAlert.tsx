import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useLicensePlanEditNames } from "./useLicenseSaveRegistry";

const joinNames = (names: string[]) =>
	names.length <= 1
		? names[0]
		: `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** Floating warning anchored just above the plan card while pending license
 * card edits would change the underlying license plan(s) — overlaid in the
 * gap above the card so it never shifts the plan layout. */
export function LicensePlanEditAlert() {
	const names = useLicensePlanEditNames();

	if (names.length === 0) return null;

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-full mb-4 flex justify-center px-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
			<div className="pointer-events-auto">
				<InfoBox variant="warning">
					Edits update the{" "}
					<span className="font-medium">{joinNames(names)}</span>{" "}
					{names.length === 1 ? "plan" : "plans"} everywhere{" "}
					{names.length === 1 ? "it's" : "they're"} offered.
				</InfoBox>
			</div>
		</div>
	);
}
