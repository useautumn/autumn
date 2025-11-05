import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { CustomToaster } from "@/components/general/CustomToaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient, useSession } from "@/lib/auth-client";
import { emailSchema } from "../SignIn";

export const PasswordSignIn = () => {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	const [googleLoading, setGoogleLoading] = useState(false);
	const [loading, setLoading] = useState(false);
	const { data: session } = useSession();

	const [searchParams] = useSearchParams();

	useEffect(() => {
		if (session?.user) {
			window.location.href = "/";
		}
	}, [session]);

	const handleEmailSignIn = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email || !emailSchema.safeParse(email).success) {
			toast.error("Please enter a valid email address.");
			return;
		}
		setLoading(true);

		try {
			const { data, error } = await authClient.signIn.email({
				email: email,
				password: password,
			});

			if (error) {
				toast.error(error.message || "Something went wrong. Please try again.");
			} else {
				window.location.href = "/sandbox/products";
			}
		} catch (error) {
			toast.error("Something went wrong. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	const height = "h-9";

	return (
		<div className="w-screen h-screen bg-background flex items-center justify-center p-4">
			<CustomToaster />
			<div className="w-full max-w-[350px] space-y-4">
				{/* Logo */}
				<div className="flex justify-center">
					<img src="/logo_hd.png" alt="Autumn" className="w-12 h-12" />
				</div>

				{/* Title */}
				<div className="text-center">
					<h1 className="text-lg font-semibold text-foreground">
						Sign in to Autumn
					</h1>
				</div>

				<>
					<div className="space-y-6">
						<div className="space-y-2">
							<Input
								type="email"
								placeholder="Email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
								className="text-base"
								autoComplete="email"
							/>
							<Input
								type="password"
								placeholder="Password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								className="text-base"
								autoComplete="email"
							/>
						</div>

						{/* Sign In Button */}
						<Button
							type="submit"
							variant="auth"
							isLoading={loading}
							onClick={handleEmailSignIn}
							className={height}
						>
							Sign in
						</Button>
					</div>

					{/* Footer */}
					{/* <div className="text-center space-y-2">
              <Link to="/sign-up" className="hover:underline text-t3 text-sm">
                Create an account here
              </Link>
            </div> */}
				</>
			</div>
		</div>
	);
};
