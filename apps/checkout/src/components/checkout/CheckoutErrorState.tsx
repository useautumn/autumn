import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CheckoutErrorState({ message }: { message: string }) {
	return (
		<div className="min-h-screen flex items-center justify-center p-4 bg-background">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="text-destructive">
						Something went wrong
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">{message}</p>
				</CardContent>
			</Card>
		</div>
	);
}
