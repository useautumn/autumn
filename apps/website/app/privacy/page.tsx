import type { ReactNode } from "react";
import AnimatedFooterImage from "@/components/animated-footer-image";
import Footer from "@/components/footer";
import Navbar from "@/components/navbar";
import type { PageStyle } from "@/lib/types";
import { cn } from "@/lib/utils";

const privacyTerms: Array<{
	title: string;
	content: ReactNode;
	isUppercase: boolean;
}> = [
	{
		title: "1. Acceptance of Terms",
		content:
			'By accessing or using the Autumn platform, APIs, SDKs, or any related services (collectively, the "Services") provided by Rebase, Inc., a Delaware corporation ("Autumn," "we," "us," or "our"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use our Services.',
		isUppercase: false,
	},
	{
		title: "2. Description of Services",
		content:
			"Autumn provides billing infrastructure, including usage-based billing, credits management, pricing configuration, and entitlements management for software applications. Our Services are designed for developers and businesses building products that require flexible billing and pricing capabilities.",
		isUppercase: false,
	},
	{
		title: "3. Account Registration",
		content:
			"To use certain features of our Services, you must create an account. You agree to provide accurate, current, and complete information during registration and to update such information as necessary. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.",
		isUppercase: false,
	},
	{
		title: "4. Acceptable Use",
		content:
			"You agree not to use the Services for any unlawful purpose or in violation of any applicable laws; (b) interfere with or disrupt the integrity or performance of the Services; (c) attempt to gain unauthorized access to the Services or related systems; (d) use the Services to transmit malicious code or harmful content; or (e) resell or redistribute the Services without our prior written consent.",
		isUppercase: false,
	},
	{
		title: "5. Payment Terms",
		content:
			"Fees for the Services are set forth on our pricing page or in a separate agreement. You agree to pay all applicable fees in accordance with the payment terms. All fees are non-refundable except as expressly stated otherwise. We reserve the right to modify our pricing with 30 days' notice.",
		isUppercase: false,
	},
	{
		title: "6. Data and Privacy",
		content:
			'Your use of the Services is subject to our Privacy Policy. You retain ownership of any data you submit to the Services ("Customer Data"). You grant us a limited license to process Customer Data solely to provide the Services. We implement reasonable security measures to protect Customer Data, but you acknowledge that no system is completely secure.',
		isUppercase: false,
	},
	{
		title: "7. Intellectual Property",
		content:
			"The Services, including all software, APIs, documentation, and related materials, are owned by Autumn and protected by intellectual property laws. We grant you a limited, non-exclusive, non-transferable license to use the Services in accordance with these Terms. You may not copy, modify, or create derivative works of the Services except as expressly permitted.",
		isUppercase: false,
	},
	{
		title: "8. Confidentiality",
		content:
			"Each party agrees to maintain the confidentiality of any non-public information disclosed by the other party and to use such information only for the purposes of these Terms. This obligation does not apply to information that is publicly available, independently developed, or rightfully received from a third party.",
		isUppercase: false,
	},
	{
		title: "9. Warranties and Disclaimers",
		content:
			'THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED OR ERROR-FREE.',
		isUppercase: true,
	},
	{
		title: "10. Limitation of Liability",
		content:
			"TO THE MAXIMUM EXTENT PERMITTED BY LAW, AUTUMN SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES. OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM THESE TERMS SHALL NOT EXCEED THE AMOUNTS PAID BY YOU TO AUTUMN IN THE TWELVE MONTHS PRECEDING THE CLAIM.",
		isUppercase: true,
	},
	{
		title: "11. Indemnification",
		content:
			"You agree to indemnify, defend, and hold harmless Autumn and its officers, directors, employees, and agents from any claims, liabilities, damages, losses, or expenses arising from your use of the Services, your violation of these Terms, or your infringement of any third-party rights.",
		isUppercase: false,
	},
	{
		title: "12. Term and Termination",
		content:
			"These Terms remain in effect until terminated. Either party may terminate for convenience with 30 days' written notice. We may suspend or terminate your access immediately if you breach these Terms. Upon termination, your right to use the Services ceases, and you must pay any outstanding fees.",
		isUppercase: false,
	},
	{
		title: "13. Modifications",
		content:
			"We may modify these Terms at any time by posting the revised Terms on our website. Material changes will be communicated with at least 30 days' notice. Your continued use of the Services after such changes constitutes acceptance of the modified Terms.",
		isUppercase: false,
	},
	{
		title: "14. Governing Law and Disputes",
		content:
			"These Terms are governed by the laws of the State of Delaware, without regard to conflict of law principles. Any disputes arising from these Terms shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association, except that either party may seek injunctive relief in any court of competent jurisdiction.",
		isUppercase: false,
	},
	{
		title: "15. General Provisions",
		content:
			"These Terms constitute the entire agreement between you and Autumn regarding the Services. If any provision is found unenforceable, the remaining provisions will continue in effect. Our failure to enforce any right or provision does not constitute a waiver. You may not assign these Terms without our prior written consent.",
		isUppercase: false,
	},
	{
		title: "16. Contact Information",
		content: (
			<>
				For questions about these Terms, please contact us at
				security@useautumn.com or at:
				<br />
				Rebase, Inc. (d/b/a Autumn)
				<br />
				Email: security@useautumn.com
				<br />
				Website: https://useautumn.com
			</>
		),
		isUppercase: false,
	},
];

export default function PrivacyPolicy() {
	return (
		<div
			className="w-full overflow-x-hidden overflow-y-auto bg-[#000000]"
			style={
				{ "--page-pad": "max(2.5rem, calc((100vw - 1440px) / 2))" } as PageStyle
			}
		>
			<div className="relative z-10 bg-[#000000] min-h-screen">
				<div className="relative w-full px-4 md:px-(--page-pad) pt-5">
					<div className="absolute pointer-events-none top-0 bottom-0 left-4 md:left-(--page-pad) border-l border-[#292929] z-50" />
					<div className="absolute pointer-events-none left-0 border-t border-[#292929] w-full" />
					<Navbar />
					<div className="absolute pointer-events-none left-0 border-b border-[#292929] w-full" />
					<div className="absolute pointer-events-none top-0 bottom-0 right-4 md:right-(--page-pad) border-r border-[#292929] z-50" />

					<div className="flex flex-col gap-2.5">
						<div className="border-t border-[#292929] w-full" />
						<div className="border-t border-[#292929] w-full hidden md:block" />
						<div className="border-t border-[#292929] w-full hidden md:block" />
						<div className="border-t border-[#292929] w-full hidden md:block" />
						<div className="border-t border-[#292929] w-full hidden md:block" />
					</div>

					<div className="flex w-full flex-col border-b border-[#292929]">
						<div className="flex w-full border-b border-[#292929]">
							<div className="hidden md:block w-1/8 lg:w-1/6 border-r bg-[#0F0F0F] border-[#292929]" />
							<div className="flex-1 bg-[#0F0F0F] px-4 sm:px-8 py-10 md:py-16">
								<h1 className="text-white text-[40px] font-sans tracking-[-2%] uppercase">
									Terms of Service
								</h1>
							</div>
							<div className="hidden md:block w-1/8 lg:w-1/6 border-l bg-[#0F0F0F] border-[#292929]" />
						</div>

						<div className="flex w-full">
							<div className="hidden md:block w-1/8 lg:w-1/6 border-r border-[#292929]" />
							<div className="flex-1 px-4 sm:px-8 py-12 md:py-16 text-white text-[16px] font-light leading-[1.6] tracking-[-2%] font-sans pb-32">
								<p className="mb-10">
									Autumn (Rebase, Inc.)
									<br />
									Effective Date: February 1, 2025
								</p>

								{privacyTerms.map((term, index) => (
									<div key={index}>
										<h3 className="mb-2 mt-8 text-[24px] leading-[30px] font-normal tracking-[-2%] text-white">
											{term.title}
										</h3>
										<p
											className={cn(
												"mb-6 text-[16px] leading-[20px] font-light tracking-[-2%] md:leading-[24px]",
												term.isUppercase && "uppercase",
											)}
										>
											{term.content}
										</p>
									</div>
								))}
							</div>
							<div className="hidden md:block w-1/8 lg:w-1/6 border-l border-[#292929]" />
						</div>
					</div>

					<Footer />
				</div>

				<div className="w-full flex-col gap-2.5 mt-10.5 hidden md:flex mb-4">
					<div className="border-t border-[#292929] w-full" />
					<div className="border-t border-[#292929] w-full" />
					<div className="border-t border-[#292929] w-full" />
					<div className="border-t border-[#292929] w-full" />
					<div className="border-t border-[#292929] w-full" />
				</div>
			</div>

			<div className="w-full aspect-390/313 sm:aspect-1440/619" />
			<AnimatedFooterImage />
		</div>
	);
}
