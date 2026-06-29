import { compareBillingControls, type FrontendProduct } from "@autumn/shared";

export type SettingChange = { key: string; label: string; detail: string };

const boolState = (value: unknown) => (value ? "enabled" : "disabled");
const orDash = (value: unknown) =>
	value === null || value === undefined || value === "" ? "—" : String(value);
const jsonChanged = (a: unknown, b: unknown) =>
	JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

// Diff straight from the products rather than preview.previous_attributes: an
// added field has an `undefined` old value, which JSON.stringify drops from the
// API response (so e.g. a newly added free trial never arrives there).
export function buildSettingsChanges({
	baseProduct,
	product,
}: {
	baseProduct: FrontendProduct | null | undefined;
	product: FrontendProduct;
}): SettingChange[] {
	if (!baseProduct) return [];
	const changes: SettingChange[] = [];

	if (baseProduct.name !== product.name) {
		changes.push({
			key: "name",
			label: "Name",
			detail: `${orDash(baseProduct.name)} → ${orDash(product.name)}`,
		});
	}
	if ((baseProduct.description ?? "") !== (product.description ?? "")) {
		changes.push({ key: "description", label: "Description", detail: "updated" });
	}
	if ((baseProduct.group ?? "") !== (product.group ?? "")) {
		changes.push({
			key: "group",
			label: "Group",
			detail: `${orDash(baseProduct.group)} → ${orDash(product.group)}`,
		});
	}
	if (baseProduct.is_add_on !== product.is_add_on) {
		changes.push({
			key: "add_on",
			label: "Add-on",
			detail: boolState(product.is_add_on),
		});
	}
	if (baseProduct.is_default !== product.is_default) {
		changes.push({
			key: "auto_enable",
			label: "Default plan",
			detail: boolState(product.is_default),
		});
	}
	if (jsonChanged(baseProduct.free_trial, product.free_trial)) {
		let detail = "updated";
		if (!baseProduct.free_trial) detail = "added";
		else if (!product.free_trial) detail = "removed";
		changes.push({ key: "free_trial", label: "Free trial", detail });
	}
	if (jsonChanged(baseProduct.config, product.config)) {
		changes.push({ key: "config", label: "Config", detail: "updated" });
	}
	const billingControlsSame = compareBillingControls({
		newBillingControls: product.billing_controls,
		curBillingControls: baseProduct.billing_controls,
	});
	if (!billingControlsSame) {
		changes.push({
			key: "billing_controls",
			label: "Billing controls",
			detail: "updated",
		});
	}

	return changes;
}

export function PlanSettingsChanges({ changes }: { changes: SettingChange[] }) {
	if (changes.length === 0) return null;
	return (
		<div className="flex flex-col gap-1 text-sm">
			{changes.map((change) => (
				<div className="flex items-center gap-1.5" key={change.key}>
					<span className="font-medium text-foreground">{change.label}</span>
					<span className="text-muted-foreground">{change.detail}</span>
				</div>
			))}
		</div>
	);
}
