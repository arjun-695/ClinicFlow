"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchAPI, API_URL } from "../utils/api";

type Props = {
  variant: "signin" | "signup";
};

export default function AuthForm({ variant }: Props) {
  const router = useRouter();
  
  // Fields for Sign In & Sign Up
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Extra fields for Sign Up
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("+91");
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const data = await fetchAPI("/api/auth/session");
        if (data.status === "Authenticated") {
          router.replace("/dashboard");
        }
      } catch {
        // ignore
      }
    };
    checkSession();
  }, [router]);

  const handleGoogleLogin = () => {
    // Redirect to the Go backend Google Login redirect initiator
    window.location.replace(`${API_URL}/api/auth/google/login`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    // Client-side validations
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Email address is required.");
      return;
    }
    
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (variant === "signup") {
      const cleanName = name.trim();
      const cleanShop = shopName.trim();
      const cleanPhoneNum = phone.replace(/[\s+-]/g, "");
      const cleanPhone = cleanPhoneNum ? `${phoneCode}${cleanPhoneNum}` : "";

      if (!cleanName) {
        setError("Your name is required.");
        return;
      }

      if (!cleanPhone) {
        setError("Phone number is required.");
        return;
      }

      // Regex phone validation
      const phoneRegex = /^\+?[\d\s-]{7,15}$/;
      if (!phoneRegex.test(cleanPhone)) {
        setError("Please enter a valid phone number (7 to 15 digits).");
        return;
      }
      
      setLoading(true);
      try {
        const resData = await fetchAPI("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            email: cleanEmail,
            password,
            name: cleanName,
            shop_name: cleanShop || "My Clinic",
            phone: cleanPhone,
          }),
        });
        
        if (resData.user) {
          router.replace("/dashboard");
        } else {
          setError("Failed to create account. Please try again.");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "An error occurred during sign up.");
      } finally {
        setLoading(false);
      }
    } else {
      // Login Flow
      setLoading(true);
      try {
        const resData = await fetchAPI("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: cleanEmail,
            password,
          }),
        });

        if (resData.user) {
          router.replace("/dashboard");
        } else {
          setError("Failed to sign in. Please try again.");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Invalid email or password.");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="backdrop-blur-2xl bg-slate-900/70 border border-slate-800/80 rounded-3xl p-8 shadow-2xl relative overflow-hidden transition-all duration-300">
        
        {/* Glow element */}
        <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-white tracking-tight">
              {variant === "signup" ? "Create Account" : "Welcome Back"}
            </h3>
            <p className="text-sm text-slate-400">
              {variant === "signup" 
                ? "Start managing your clinic practice today."
                : "Sign in to continue to your ClinicFlow portal."}
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 p-4 rounded-2xl animate-[shake_0.5s_ease-in-out]">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="font-medium">{error}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {variant === "signup" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition outline-none text-sm"
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Clinic Name</label>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition outline-none text-sm"
                    placeholder="e.g. Hope Clinic (optional)"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">WhatsApp / Phone Number</label>
                  <div className="flex gap-2">
                    <div className="w-24 flex-shrink-0">
                      <select
                        value={phoneCode}
                        onChange={(e) => setPhoneCode(e.target.value)}
                        className="w-full px-3 py-3 rounded-2xl bg-slate-955/80 border border-slate-800 text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition outline-none text-xs cursor-pointer h-[46px]"
                      >
                        <option value="+91">🇮🇳 +91</option>
                        <option value="+1">🇺🇸 +1</option>
                        <option value="+44">🇬🇧 +44</option>
                        <option value="+971">🇦🇪 +971</option>
                        <option value="+61">🇦🇺 +61</option>
                        <option value="+65">🇸🇬 +65</option>
                        <option value="+86">🇨🇳 +86</option>
                        <option value="+81">🇯🇵 +81</option>
                        <option value="+49">🇩🇪 +49</option>
                        <option value="+33">🇫🇷 +33</option>
                        <option value="+7">🇷🇺 +7</option>
                        <option value="+92">🇵🇰 +92</option>
                        <option value="+880">🇧🇩 +880</option>
                        <option value="+977">🇳🇵 +977</option>
                        <option value="+94">🇱🇰 +94</option>
                      </select>
                    </div>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="flex-grow px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition outline-none text-sm h-[46px]"
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition outline-none text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-300">Password</label>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition outline-none text-sm"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-purple-600 hover:via-indigo-600 hover:to-indigo-500 text-white font-semibold shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] transition-all duration-300 outline-none text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Processing...</span>
                </div>
              ) : variant === "signup" ? (
                "Create Account"
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="relative my-6 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800/80" />
            </div>
            <span className="relative z-10 px-3 bg-slate-900/20 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Or continue with
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full py-3.5 rounded-2xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white font-semibold flex items-center justify-center shadow-md active:scale-[0.98] transition-all duration-300 outline-none text-sm cursor-pointer"
          >
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <div className="text-center pt-2 text-sm text-slate-400">
            {variant === "signup" ? (
              <p>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => router.push("/signin")}
                  className="font-semibold text-indigo-400 hover:text-indigo-300 transition hover:underline"
                >
                  Sign In
                </button>
              </p>
            ) : (
              <p>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => router.push("/signup")}
                  className="font-semibold text-indigo-400 hover:text-indigo-300 transition hover:underline"
                >
                  Create Account
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
