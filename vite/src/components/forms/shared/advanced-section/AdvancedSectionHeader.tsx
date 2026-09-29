import { AdvancedSectionTitle } from "./AdvancedSectionTitle";

export function AdvancedSectionHeader({ title }: { title: string }) {
	return (
		<div className="flex h-[42px] items-center">
			<AdvancedSectionTitle title={title} />
		</div>
	);
}
