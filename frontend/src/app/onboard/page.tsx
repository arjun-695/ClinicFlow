"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchAPI } from "../../utils/api";
import { Activity, KeyRound, User, Phone, MapPin, Image, Stethoscope, Save } from "lucide-react";
import HeaderSimple from "../../components/HeaderSimple";

function OnboardContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const token = searchParams.get("token") || "";

	const [step, setStep] = useState(1); // 1 = Verify OTP, 2 = Complete Profile
	const [otp, setOtp] = useState("");
	const [email, setEmail] = useState("");
	const [invitedRole, setInvitedRole] = useState("");

	// Profile details
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [phone, setPhone] = useState("");
	const [location, setLocation] = useState("");
	const [specialization, setSpecialization] = useState("");

	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!token) {
			setError("Invitation token is missing. Please contact your administrator.");
		}
	}, [token]);

	const handleVerifyOTP = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		if (otp.length < 6) {
			setError("Please enter the 6-digit verification code.");
			return;
		}

		setLoading(true);
		try {
			const data = await fetchAPI("/api/auth/invite/verify", {
				method: "POST",
				body: JSON.stringify({ token, otp }),
			});
			setEmail(data.email);
			setInvitedRole(data.role);
			if (data.phone) {
				setPhone(data.phone);
			}
			setStep(2);
		} catch (err: any) {
			setError(err.message || "Failed to verify invitation. Please check your code.");
		} finally {
			setLoading(false);
		}
	};

	const handleCompleteRegistration = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (!password || password.length < 6) {
			setError("Password must be at least 6 characters.");
			return;
		}
		if (!name) {
			setError("Name is required.");
			return;
		}

		setLoading(true);
		try {
			await fetchAPI("/api/auth/invite/accept", {
				method: "POST",
				body: JSON.stringify({
					token,
					otp,
					password,
					name,
					phone,
					location,
					photo_url: "",
					specialization,
				}),
			});
			setSuccess("Registration completed successfully!");
			setTimeout(() => {
				router.push("/dashboard");
			}, 1500);
		} catch (err: any) {
			setError(err.message || "Registration failed. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-[#090d16] text-white flex flex-col justify-between py-6">
			<div className="max-w-md w-full mx-auto px-4 space-y-6 my-auto">
				<div className="text-center space-y-2">
					<div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg mx-auto">
						<Activity className="w-6 h-6 text-white" />
					</div>
					<h1 className="text-2xl font-black tracking-tight">ClinicFlow Onboarding</h1>
					<p className="text-xs text-slate-400">Complete your medical staff registration</p>
				</div>

				<div className="backdrop-blur-2xl bg-slate-900/70 border border-slate-800/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
					{error && (
						<div className="mb-4 text-xs text-red-400 bg-red-950/40 border border-red-900/60 p-3.5 rounded-2xl">
							{error}
						</div>
					)}
					{success && (
						<div className="mb-4 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 p-3.5 rounded-2xl">
							{success}
						</div>
					)}

					{step === 1 ? (
						<form onSubmit={handleVerifyOTP} className="space-y-4">
							<div className="text-center space-y-1">
								<h2 className="text-sm font-bold text-slate-200">Verify Invitation</h2>
								<p className="text-[10px] text-slate-400">Enter the 6-digit OTP code sent to your email/SMS.</p>
							</div>

							<div className="space-y-2">
								<label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">OTP Code</label>
								<div className="relative">
									<KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
									<input
										type="text"
										maxLength={6}
										placeholder="e.g. 123456"
										value={otp}
										onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
										className="w-full pl-10 pr-4 py-2 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-center font-bold tracking-widest text-white"
										disabled={loading || !token}
									/>
								</div>
							</div>

							<button
								type="submit"
								disabled={loading || !token}
								className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer"
							>
								{loading ? "Verifying..." : "Verify Invitation"}
							</button>
						</form>
					) : (
						<form onSubmit={handleCompleteRegistration} className="space-y-4">
							<div className="text-center space-y-1">
								<h2 className="text-sm font-bold text-slate-200">Create Staff Profile</h2>
								<p className="text-[10px] text-slate-400">Role: <span className="font-bold text-indigo-400">{invitedRole}</span> ({email})</p>
							</div>

							<div className="grid grid-cols-1 gap-3.5">
								<div className="space-y-1">
									<label className="text-[9px] font-bold uppercase text-slate-400">Full Name</label>
									<div className="relative">
										<User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
										<input
											type="text"
											placeholder="Your Name"
											value={name}
											onChange={(e) => setName(e.target.value)}
											className="w-full pl-10 pr-4 py-2 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
											required
										/>
									</div>
								</div>

								<div className="space-y-1">
									<label className="text-[9px] font-bold uppercase text-slate-400">Set Password</label>
									<div className="relative">
										<KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
										<input
											type="password"
											placeholder="Min 6 characters"
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											className="w-full pl-10 pr-4 py-2 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
											required
										/>
									</div>
								</div>

								<div className="space-y-1">
									<label className="text-[9px] font-bold uppercase text-slate-400">Contact Number</label>
									<div className="relative">
										<Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
										<input
											type="tel"
											placeholder="+1234567890"
											value={phone}
											onChange={(e) => setPhone(e.target.value)}
											className="w-full pl-10 pr-4 py-2 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
										/>
									</div>
								</div>

								{invitedRole === "DOCTOR" && (
									<>
										<div className="space-y-1">
											<label className="text-[9px] font-bold uppercase text-slate-400">Specialization</label>
											<div className="relative">
												<Stethoscope className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
												<input
													type="text"
													placeholder="e.g. Cardiology, Pediatrics"
													value={specialization}
													onChange={(e) => setSpecialization(e.target.value)}
													className="w-full pl-10 pr-4 py-2 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
												/>
											</div>
										</div>

										<div className="space-y-1">
											<label className="text-[9px] font-bold uppercase text-slate-400">Location / Clinic Room</label>
											<div className="relative">
												<MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
												<input
													type="text"
													placeholder="e.g. Room 402, Block B"
													value={location}
													onChange={(e) => setLocation(e.target.value)}
													className="w-full pl-10 pr-4 py-2 border border-slate-800 rounded-xl bg-slate-950 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
												/>
											</div>
										</div>

									</>
								)}
							</div>

							<button
								type="submit"
								disabled={loading}
								className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center space-x-1 cursor-pointer mt-2"
							>
								<Save className="w-4 h-4" />
								<span>{loading ? "Registering..." : "Complete Registration"}</span>
							</button>
						</form>
					)}
				</div>
			</div>
		</div>
	);
}

export default function OnboardPage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-[#090d16] text-white flex items-center justify-center font-bold text-sm">Loading Onboarding...</div>}>
			<OnboardContent />
		</Suspense>
	);
}
