import { SectionTag } from "@autumn/ui";

export const Default = () => <SectionTag>Features</SectionTag>;

export const SectionHeadings = () => (
	<div className="flex flex-col gap-3">
		<div>
			<SectionTag>Plan details</SectionTag>
			<p className="text-muted-foreground text-sm">
				Growth · $99/month · renews Apr 1, 2025
			</p>
		</div>
		<div>
			<SectionTag>Included features</SectionTag>
			<p className="text-muted-foreground text-sm">
				100,000 API calls · 25 seats · 500 GB storage
			</p>
		</div>
		<div>
			<SectionTag>Billing</SectionTag>
			<p className="text-muted-foreground text-sm">Visa •••• 4242</p>
		</div>
	</div>
);

export const Variations = () => (
	<div className="flex flex-wrap items-center gap-2">
		<SectionTag className="mb-0">Products</SectionTag>
		<SectionTag className="mb-0">Customers</SectionTag>
		<SectionTag className="mb-0">Invoices</SectionTag>
	</div>
);
