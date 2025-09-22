import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "sonner";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/**
 * Generate a random 6-digit OTP as a string.
 * Ensures the first digit is non-zero so the OTP is always 6 digits long.
 */

export const Otp = () => {
	const [theOtp, setTheOtp] = useState("");
	const axiosInstance = useAxiosInstance();

	useEffect(() => {
		const fetchOtp = async () => {
			const { otp } = await DevService.createOTP(axiosInstance);
			setTheOtp(otp);
		};
		fetchOtp();
	}, []);

	const handleCopyToClipboard = async () => {
		try {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				await navigator.clipboard.writeText(theOtp);
			} else {
				// Fallback for browsers/environments without navigator.clipboard
				const textarea = document.createElement("textarea");
				textarea.value = theOtp;
				textarea.style.position = "fixed"; // Avoid scrolling to bottom
				textarea.style.left = "-9999px";
				document.body.appendChild(textarea);
				textarea.focus();
				textarea.select();
				document.execCommand("copy");
				document.body.removeChild(textarea);
			}
			toast.success("OTP copied to clipboard!");
		} catch (error) {
			console.error("Failed to copy OTP to clipboard", error);
			toast.error("Failed to copy OTP to clipboard");
		}
	};

	return (
		<div className="flex flex-col items-center justify-center min-h-screen p-4">
			<div className="max-w-md w-full space-y-6">
				<div className="text-center">
					<h1 className="text-3xl font-bold">Copy OTP to Terminal</h1>
					<p className="mt-2 text-muted-foreground">
						Copy the OTP code below and enter it in your terminal to continue.
						This code will only last 5 minutes.
					</p>
				</div>

				<div className="space-y-6">
					<div className="flex flex-col items-center justify-center">
						<InputOTP
							value={theOtp}
							maxLength={6}
							textAlign="center"
							className="w-48"
						>
							<InputOTPGroup className="justify-center">
								<InputOTPSlot index={0} />
								<InputOTPSlot index={1} />
								<InputOTPSlot index={2} />
								<InputOTPSlot index={3} />
								<InputOTPSlot index={4} />
								<InputOTPSlot index={5} />
							</InputOTPGroup>
						</InputOTP>
					</div>

					<Button
						onClick={handleCopyToClipboard}
						variant="gradientPrimary"
						className="w-full"
						isLoading={false}
					>
						Copy to Clipboard
					</Button>
				</div>
			</div>
		</div>
	);
};
