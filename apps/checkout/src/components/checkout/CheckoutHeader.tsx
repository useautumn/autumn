interface CheckoutHeaderProps {
	org?: {
		name: string;
		logo: string | null;
	};
}

export function CheckoutHeader({ org }: CheckoutHeaderProps) {
	return (
		<div className="flex flex-col gap-4">
			{/* Org branding */}
			{org && (
				<div className="flex items-center gap-2">
					{org.logo && (
						<img
							src={org.logo}
							alt={org.name}
							className="h-6 w-6 rounded-full object-cover"
						/>
					)}
					<span className="text-sm text-muted-foreground">
						{org.name}
					</span>
				</div>
			)}

			{/* Title and description */}
			<div className="flex flex-col gap-2">
				<h1 className="text-2xl text-foreground">Confirm your order</h1>
				<p className="text-base text-muted-foreground">
					Please review your order and confirm to complete your purchase.
				</p>
			</div>
		</div>
	);
}
