import { Button, SmallSpinner } from "@autumn/ui";

export const Sizes = () => (
	<div className="flex items-center gap-4 text-foreground">
		<SmallSpinner size={12} />
		<SmallSpinner size={18} />
		<SmallSpinner size={24} />
		<SmallSpinner size={32} />
	</div>
);

export const Colors = () => (
	<div className="flex items-center gap-4">
		<SmallSpinner className="text-primary" size={20} />
		<SmallSpinner className="text-muted-foreground" size={20} />
		<div className="flex items-center justify-center rounded-md bg-primary p-2">
			<SmallSpinner className="text-primary-foreground" size={20} />
		</div>
	</div>
);

export const InlineLoading = () => (
	<div className="flex flex-col gap-2">
		<div className="flex items-center gap-2 text-md">
			<SmallSpinner className="text-primary" size={14} />
			<span className="text-muted-foreground">Syncing invoices from Stripe</span>
		</div>
		<div className="flex items-center gap-2 text-md">
			<SmallSpinner className="text-primary" size={14} />
			<span className="text-muted-foreground">Migrating 1,204 customers</span>
		</div>
	</div>
);

export const InButton = () => (
	<div className="flex flex-wrap items-center gap-2">
		<Button variant="secondary">
			<SmallSpinner size={14} />
			Creating product
		</Button>
		<Button variant="primary">
			<SmallSpinner size={14} />
			Saving
		</Button>
	</div>
);
