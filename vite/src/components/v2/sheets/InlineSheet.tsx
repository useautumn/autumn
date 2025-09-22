import { Separator } from "@/components/ui/separator";

interface SheetHeaderProps {
	title: string;
	description: string;
}

export function SheetHeader({ title, description }: SheetHeaderProps) {
	return (
		<div className="p-6 pb-0">
			<h2 className="text-main">{title}</h2>

			{/* check typography */}
			<p className="text-form-text">{description}</p>
			<Separator className="mt-6" />
		</div>
	);
}

interface SheetSectionProps {
	title: string;
	children: React.ReactNode;
}

export function SheetSection({ title, children }: SheetSectionProps) {
	return (
		<div className="p-6">
			<h3 className="text-sub mb-2">{title}</h3>
			{children}
		</div>
	);
}
