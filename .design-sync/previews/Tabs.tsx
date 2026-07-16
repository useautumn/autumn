import { Tabs, TabsContent, TabsList, TabsTrigger } from "@autumn/ui";

export const Default = () => (
	<Tabs defaultValue="overview">
		<TabsList>
			<TabsTrigger value="overview">Overview</TabsTrigger>
			<TabsTrigger value="features">Features</TabsTrigger>
			<TabsTrigger value="invoices">Invoices</TabsTrigger>
		</TabsList>
		<TabsContent value="overview">
			<p className="text-muted-foreground text-sm">
				Acme Corp is on the Pro Plan at $49/month, renewing Aug 1, 2026.
			</p>
		</TabsContent>
		<TabsContent value="features">
			<p className="text-muted-foreground text-sm">
				100,000 API credits included, 4 of 10 seats used.
			</p>
		</TabsContent>
		<TabsContent value="invoices">
			<p className="text-muted-foreground text-sm">
				Last invoice inv_1PqR2xKz for $121.40 was paid on Jul 1, 2026.
			</p>
		</TabsContent>
	</Tabs>
);

export const OnboardingVariant = () => (
	<Tabs defaultValue="stripe">
		<TabsList>
			<TabsTrigger variant="onboarding" value="stripe">
				Connect Stripe
			</TabsTrigger>
			<TabsTrigger variant="onboarding" value="products">
				Create products
			</TabsTrigger>
			<TabsTrigger variant="onboarding" value="install">
				Install SDK
			</TabsTrigger>
		</TabsList>
		<TabsContent value="stripe">
			<p className="text-muted-foreground text-sm">
				Autumn syncs your products and invoices to Stripe automatically.
			</p>
		</TabsContent>
		<TabsContent value="products">
			<p className="text-muted-foreground text-sm">
				Define plans and the features each plan grants.
			</p>
		</TabsContent>
		<TabsContent value="install">
			<p className="text-muted-foreground text-sm">
				Run <code className="text-foreground">npm i autumn-js</code> to get
				started.
			</p>
		</TabsContent>
	</Tabs>
);

export const WithDisabled = () => (
	<Tabs defaultValue="sandbox">
		<TabsList>
			<TabsTrigger value="sandbox">Sandbox</TabsTrigger>
			<TabsTrigger value="production" disabled>
				Production
			</TabsTrigger>
		</TabsList>
		<TabsContent value="sandbox">
			<p className="text-muted-foreground text-sm">
				Customers created here won't be charged. Connect Stripe to unlock
				production.
			</p>
		</TabsContent>
	</Tabs>
);
