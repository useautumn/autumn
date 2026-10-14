import { Tabs, TabsContent, TabsList, TabsTrigger } from "@autumn/ui";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { ShadowAtomDeploymentSection } from "./ShadowAtomDeploymentSection";
import { ShadowAtomOrgsSection } from "./ShadowAtomOrgsSection";

const SHADOW_ATOM_TABS = ["atom", "orgs"] as const;

export const ShadowAtomTab = () => {
	const [tab, setTab] = useQueryState(
		"tab",
		parseAsStringLiteral(SHADOW_ATOM_TABS).withDefault("atom"),
	);

	return (
		<Tabs
			value={tab}
			onValueChange={(value) =>
				setTab(value as (typeof SHADOW_ATOM_TABS)[number])
			}
			className="max-w-5xl"
		>
			<TabsList>
				<TabsTrigger value="atom">Atom</TabsTrigger>
				<TabsTrigger value="orgs">Orgs</TabsTrigger>
			</TabsList>
			<TabsContent value="atom" className="mt-4">
				<ShadowAtomDeploymentSection />
			</TabsContent>
			<TabsContent value="orgs" className="mt-4">
				<ShadowAtomOrgsSection />
			</TabsContent>
		</Tabs>
	);
};
