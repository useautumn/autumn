import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { CustomToaster } from "@/components/general/CustomToaster";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { authClient, useSession } from "@/lib/auth-client";
import { emailRegex } from "../SignIn";

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
		if (!email || !emailRegex.test(email)) {
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
				window.location.href = "/";
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
					<svg width="48" height="48" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
						<mask id="icon-cutout">
							<rect width="28" height="28" fill="white"/>
							<path d="M10.7139 9.06887C9.77726 11.211 8.84052 13.3532 7.90386 15.4953C8.63795 16.4465 9.37205 17.3984 10.1061 18.3496C12.2827 15.537 14.4599 12.7244 16.637 9.91183L9.27077 22.9514C12.9161 20.7518 16.5615 18.5529 20.2069 16.3534V4.85034L10.7139 9.06887Z" fill="black"/>
						</mask>
						<rect width="28" height="28" fill="currentColor" mask="url(#icon-cutout)"/>
					</svg>
				</div>

				{/* Title */}
				<div className="text-center">
					<h1 className="text-lg font-semibold text-foreground">
						Sign in to Autumn
					</h1>
				</div>

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
						variant="secondary"
						isLoading={loading}
						onClick={handleEmailSignIn}
						className={`w-full ${height}`}
					>
						Sign in
					</Button>
				</div>

				{/* Footer */}
				{/* <div className="text-center space-y-2">
              <Link to="/sign-up" className="hover:underline text-tertiary-foreground text-sm">
                Create an account here
              </Link>
            </div> */}
			</div>
		</div>
	);
};
