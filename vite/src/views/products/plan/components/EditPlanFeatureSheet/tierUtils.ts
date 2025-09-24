import { Infinite, type ProductItem } from "@autumn/shared";

export const addTier = ({
	item,
	setItem,
}: {
	item: ProductItem;
	setItem: (item: ProductItem) => void;
}) => {
	if (!item) return;

	if (!item.tiers || item.tiers.length === 0) {
		// First tier should be infinite for single tier pricing
		setItem({ ...item, tiers: [{ to: Infinite, amount: 0 }] });
	} else if (item.tiers.length === 1) {
		// Converting from single tier to multi-tier
		const firstTier = item.tiers[0];
		setItem({
			...item,
			tiers: [
				{ to: 100, amount: firstTier.amount }, // First tier with default limit
				{ to: Infinite, amount: 0 }, // Second tier is infinite
			],
		});
	} else {
		// Adding to existing multi-tier setup
		const newTiers = [...item.tiers];
		const lastTier = newTiers[newTiers.length - 1];

		// Set previous last tier to a default value if it was infinite
		if (lastTier.to === Infinite) {
			const prevTierTo = newTiers[newTiers.length - 2]?.to;
			lastTier.to = (typeof prevTierTo === 'number' ? prevTierTo : 0) + 100;
		}

		// Add new infinite tier
		newTiers.push({ to: Infinite, amount: 0 });
		setItem({ ...item, tiers: newTiers });
	}
};

export const removeTiers = ({
	item,
	setItem,
}: {
	item: ProductItem;
	setItem: (item: ProductItem) => void;
}) => {
	setItem({ ...item, tiers: null });
};

export const removeTier = ({
	item,
	setItem,
	index,
}: {
	item: ProductItem;
	setItem: (item: ProductItem) => void;
	index: number;
}) => {
	if (!item.tiers || item.tiers.length <= 1) {
		// If removing the last tier, switch to included usage mode
		setItem({ ...item, tiers: null });
		return;
	}

	const newTiers = [...item.tiers];
	newTiers.splice(index, 1);

	// Ensure last tier is always infinite
	if (newTiers.length > 0) {
		newTiers[newTiers.length - 1].to = Infinite;
	}

	setItem({ ...item, tiers: newTiers });
};

export const updateTier = ({
	item,
	setItem,
	index,
	field,
	value,
}: {
	item: ProductItem;
	setItem: (item: ProductItem) => void;
	index: number;
	field: "to" | "amount";
	value: string;
}) => {
	if (!item.tiers) return;

	const newTiers = [...item.tiers];
	if (field === "to") {
		// Handle empty string, infinity, or numeric values
		let numValue: number | typeof Infinite;
		if (value === "" || value === "∞") {
			numValue = value === "" ? 0 : Infinite;
		} else {
			const parsed = parseInt(value);
			numValue = Number.isNaN(parsed) ? 0 : parsed;
		}
		newTiers[index] = { ...newTiers[index], to: numValue };
		if (newTiers[index + 1]) {
			newTiers[index + 1].to = numValue;
		}
	} else if (field === "amount") {
		// Handle empty string or numeric values
		let numValue: number;
		if (value === "") {
			numValue = 0;
		} else {
			const parsed = parseFloat(value);
			numValue = Number.isNaN(parsed) ? 0 : parsed;
		}
		newTiers[index] = { ...newTiers[index], amount: numValue };
	}
	setItem({ ...item, tiers: newTiers });
};
