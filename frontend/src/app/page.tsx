"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  BookOpen, 
  Truck, 
  IndianRupee, 
  MessageSquare, 
  Plus, 
  Minus, 
  ArrowRight, 
  Shield, 
  Zap, 
  Sparkles,
  ChevronDown
} from "lucide-react";
import { fetchAPI } from "../utils/api";

export default function LandingPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [preloaded, setPreloaded] = useState(false);

  // References for Canvas & Animation Loop
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  
  // Track scroll state in refs to prevent high-frequency React state re-renders
  const scrollRef = useRef({
    current: 0,
    target: 0,
  });

  // References to overlay section elements for direct DOM manipulation in the rAF loop
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const progressTextRef = useRef<HTMLSpanElement | null>(null);

  // Interactive Denomination Calculator Widget State
  const [denominations, setDenominations] = useState<Record<number, number>>({
    500: 2,
    200: 3,
    100: 5,
    50: 10,
    20: 0,
    10: 0,
  });

  // Generate image paths (80 frames total)
  const totalFrames = 80;
  const frames: string[] = [];
  for (let i = 0; i < 40; i++) {
    const numStr = String(i).padStart(3, "0");
    frames.push(`/money-jar/Video_money_flowing_into_jar_202605272308_${numStr}.jpg`);
    frames.push(`/money-jar/Video_money_flowing_into_jar_202605272308_${numStr}_001.jpg`);
  }

  // 1. Preload all background images on mount
  useEffect(() => {
    let loadedCount = 0;
    const loadedImages: HTMLImageElement[] = [];
    
    const preloadImages = () => {
      frames.forEach((src, idx) => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
          loadedCount++;
          loadedImages[idx] = img;
          if (loadedCount === totalFrames) {
            imagesRef.current = loadedImages;
            setPreloaded(true);
          }
        };
        img.onerror = () => {
          loadedCount++;
          // Fallback empty image to keep correct indices
          const fallback = new Image();
          loadedImages[idx] = fallback;
          if (loadedCount === totalFrames) {
            imagesRef.current = loadedImages;
            setPreloaded(true);
          }
        };
      });
    };

    preloadImages();
    // Fallback if network is slow
    const timer = setTimeout(() => {
      setPreloaded(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  // 2. Verify auth session on load
  useEffect(() => {
    const checkSession = async () => {
      try {
        const data = await fetchAPI("/api/auth/session");
        if (data.status === "Authenticated") {
          router.push("/dashboard");
        } else {
          setCheckingAuth(false);
        }
      } catch {
        setCheckingAuth(false);
      }
    };
    checkSession();
  }, [router]);

  // 3. Track scroll progress dynamically inside Ref
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const progress = scrollTop / docHeight;
      scrollRef.current.target = Math.min(1, Math.max(0, progress));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 4. Handle Canvas Dimension Resizing
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [preloaded]);

  // 5. Hardware-Accelerated Animation Loop (requestAnimationFrame + Lerp)
  useEffect(() => {
    if (checkingAuth) return;
    
    let rAF: number;
    
    const animate = () => {
      // Linear Interpolation (Lerp) to smooth out the frame updates
      const delta = scrollRef.current.target - scrollRef.current.current;
      if (Math.abs(delta) < 0.0001) {
        scrollRef.current.current = scrollRef.current.target;
      } else {
        // Easing factor (0.09) provides smooth deceleration
        scrollRef.current.current += delta * 0.09;
      }

      const currentProgress = scrollRef.current.current;

      // Draw the active frame onto the Canvas
      const canvas = canvasRef.current;
      const images = imagesRef.current;
      if (canvas && images.length === totalFrames) {
        const ctx = canvas.getContext("2d");
        const frameIndex = Math.min(
          totalFrames - 1,
          Math.max(0, Math.floor(currentProgress * totalFrames))
        );
        
        const img = images[frameIndex];
        if (ctx && img && img.complete) {
          const canvasWidth = canvas.width;
          const canvasHeight = canvas.height;
          const imgWidth = img.naturalWidth || img.width || canvasWidth;
          const imgHeight = img.naturalHeight || img.height || canvasHeight;
          
          const imgRatio = imgWidth / imgHeight;
          const canvasRatio = canvasWidth / canvasHeight;
          
          let drawWidth = canvasWidth;
          let drawHeight = canvasHeight;
          let offsetX = 0;
          let offsetY = 0;
          
          // Mimic CSS "object-fit: cover"
          if (canvasRatio > imgRatio) {
            drawHeight = canvasWidth / imgRatio;
            offsetY = (canvasHeight - drawHeight) / 2;
          } else {
            drawWidth = canvasHeight * imgRatio;
            offsetX = (canvasWidth - drawWidth) / 2;
          }
          
          ctx.clearRect(0, 0, canvasWidth, canvasHeight);
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        }
      }

      // Directly animate overlay sections in DOM to bypass React re-renders
      const centers = [0.08, 0.38, 0.68, 0.94];
      sectionRefs.current.forEach((el, index) => {
        if (!el) return;
        const center = centers[index];
        const distance = Math.abs(currentProgress - center);
        const fadeRange = 0.15;
        
        let opacity = 1 - (distance / fadeRange);
        opacity = Math.max(0, Math.min(1, opacity));
        
        const isEntering = currentProgress < center;
        const translateY = isEntering 
          ? (center - currentProgress) * 120 
          : (center - currentProgress) * 120;
          
        el.style.opacity = String(opacity);
        el.style.transform = `translate3d(0, ${translateY}px, 0)`;
        el.style.pointerEvents = opacity > 0.35 ? "auto" : "none";
        el.style.display = opacity > 0.01 ? "flex" : "none";
      });

      // Update progress textual indicator in footer
      if (progressTextRef.current) {
        progressTextRef.current.textContent = `Progress: ${Math.round(currentProgress * 100)}%`;
      }

      rAF = requestAnimationFrame(animate);
    };

    rAF = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rAF);
  }, [checkingAuth, preloaded]);

  // Handler to adjust denominations in the calculator widget
  const adjustCount = (denom: number, amount: number) => {
    setDenominations(prev => {
      const current = prev[denom] || 0;
      const nextValue = Math.max(0, current + amount);
      return { ...prev, [denom]: nextValue };
    });
  };

  // Compute total value
  const totalValue = Object.entries(denominations).reduce(
    (sum, [denom, count]) => sum + parseInt(denom) * count,
    0
  );

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4 text-slate-100">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-2xl animate-pulse">
            <span className="font-extrabold text-xl text-white">KF</span>
          </div>
          <div className="absolute inset-0 rounded-3xl border border-indigo-500/30 scale-125 animate-ping opacity-20" />
        </div>
        <div className="text-sm font-medium text-slate-400 tracking-wider uppercase animate-pulse">
          Syncing ClinicFlow...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[500vh] bg-[#030712] text-slate-100 font-sans selection:bg-indigo-500 selection:text-white relative">
      
      {/* 1. FIXED CANVAS BACKDROP: Hardware-accelerated drawing on the GPU */}
      <div className="fixed inset-0 w-full h-screen z-0 overflow-hidden select-none pointer-events-none">
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Dark radial overlay to ensure high readability of overlay cards */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#030712]/95 via-[#030712]/75 to-[#030712]/95" />
      </div>

      {/* 2. FIXED STICKY INTERFACE CONTAINER: Holds static menus and scrolling pages */}
      <div className="fixed inset-0 w-full h-screen z-10 pointer-events-none flex flex-col justify-between">
        
        {/* Fixed Header */}
        <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg transform transition hover:rotate-12 duration-300">
              <span className="font-black text-white text-base">CF</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">ClinicFlow</h3>
              <p className="text-[9px] font-semibold text-indigo-400 tracking-wider uppercase">Patient EMR & Billing</p>
            </div>
          </div>

          <nav className="flex items-center space-x-4">
            <Link
              href="/signin"
              className="px-4.5 py-2 rounded-2xl border border-slate-800/80 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900/50 hover:border-slate-700 transition duration-300 pointer-events-auto"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="px-4.5 py-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-xs font-semibold text-white shadow-md hover:shadow-indigo-500/20 active:scale-[0.98] transition duration-300 pointer-events-auto"
            >
              Get Started
            </Link>
          </nav>
        </header>

        {/* Dynamic Scrollytelling Panels Container */}
        <div className="flex-grow w-full max-w-5xl mx-auto px-6 relative flex items-center justify-center">
          
          {/* SECTION 0: Hero Panel (visible around 8% scroll) */}
          <div 
            ref={(el) => { sectionRefs.current[0] = el; }}
            style={{ display: "none" }}
            className="absolute inset-0 flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-6"
          >
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-900/50 text-xs font-semibold text-indigo-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Interactive Patient EMR & Scheduling</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight text-white tracking-tight">
              Streamline Your <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400">Clinic Practice</span> With ClinicFlow.
            </h1>
            
            <p className="text-sm md:text-base text-slate-400 leading-relaxed">
              Ditch paper files. Book patient appointments, manage pharmacy stock, compile detailed bills/prescriptions, and send automated WhatsApp receipts to your patients.
            </p>

            <div className="flex items-center space-x-4 pt-2 pointer-events-auto">
              <Link
                href="/signup"
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-purple-600 hover:to-indigo-500 text-white font-bold text-center text-sm shadow-xl hover:shadow-indigo-500/20 active:scale-[0.98] transition-all duration-300 flex items-center space-x-2 pointer-events-auto group"
              >
                <span>Create Doctor Account</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center text-slate-500 animate-bounce">
              <span className="text-[10px] uppercase font-bold tracking-widest mb-1">Scroll to explore</span>
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>

          {/* SECTION 1: Credit Ledger (visible around 38% scroll) */}
          <div 
            ref={(el) => { sectionRefs.current[1] = el; }}
            style={{ display: "none" }}
            className="absolute inset-0 flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-5"
          >
            <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <BookOpen className="w-6 h-6" />
            </div>
            
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Say Goodbye to Misplaced Records
            </h2>
            
            <p className="text-sm text-slate-400 leading-relaxed">
              Log patient demographic cards directly. Keep historical records of patient diagnoses, past medical reports, and current pharmacy prescription details in one secure place.
            </p>

            <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl backdrop-blur-md max-w-md">
              <p className="text-xs text-slate-500 italic">
                "We had hundreds of physical files to browse through daily. With ClinicFlow, patient records are instantly retrievable on screen."
              </p>
            </div>
          </div>

          {/* SECTION 2: WhatsApp Alerts (visible around 68% scroll) */}
          <div 
            ref={(el) => { sectionRefs.current[2] = el; }}
            style={{ display: "none" }}
            className="absolute inset-0 flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-5"
          >
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <MessageSquare className="w-6 h-6" />
            </div>
            
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Automated WhatsApp Reminders
            </h2>
            
            <p className="text-sm text-slate-400 leading-relaxed">
              Link your phone using a simple QR pairing screen. Our automated background worker scans due dates and drafts friendly reminder notifications directly to your customer's WhatsApp.
            </p>

            <div className="flex items-center space-x-3 px-4 py-2 bg-emerald-950/30 border border-emerald-900/40 rounded-full text-xs text-emerald-400">
              <Zap className="w-4 h-4" />
              <span className="font-semibold">Automatic background cron schedules run every 30 minutes</span>
            </div>
          </div>

          {/* SECTION 3: Denomination Calculator (visible around 94% scroll) */}
          <div 
            ref={(el) => { sectionRefs.current[3] = el; }}
            style={{ display: "none" }}
            className="absolute inset-0 flex flex-col lg:flex-row items-center justify-center max-w-4xl mx-auto gap-8 overflow-y-auto max-h-[80vh] py-4 pointer-events-auto"
          >
            {/* Texts */}
            <div className="text-center lg:text-left space-y-4 lg:w-1/2">
              <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 justify-center">
                <IndianRupee className="w-6 h-6" />
              </div>
              <h2 className="text-3xl font-bold text-white tracking-tight">
                Live Cash Denominations
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Log cash payments accurately. Tap notes to calculate totals in real-time. This dynamic tool is fully integrated inside your main transaction workflow.
              </p>
              <div className="pt-2 hidden lg:block">
                <Link
                  href="/signup"
                  className="inline-flex px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs active:scale-95 transition cursor-pointer"
                >
                  Start Hardening Your Credit Ledger
                </Link>
              </div>
            </div>

            {/* Interactive Calculator Card */}
            <div className="w-full max-w-sm backdrop-blur-md bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 shadow-2xl space-y-4 select-none">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Calculator Sandbox</span>
                <span className="text-[9px] font-semibold text-slate-500 bg-slate-950 px-2 py-0.5 rounded-full">Interactive</span>
              </div>

              {/* Total Display */}
              <div className="bg-slate-950/70 border border-slate-800/60 rounded-xl p-3.5 text-center">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Total Amount</span>
                <div className="text-2xl font-black text-white mt-0.5 flex items-center justify-center">
                  <span className="text-indigo-400 text-lg mr-1">₹</span>
                  <span>{totalValue.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* Rows */}
              <div className="space-y-2">
                {[500, 200, 100, 50].map((denom) => {
                  const count = denominations[denom] || 0;
                  return (
                    <div 
                      key={denom} 
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-950/30 border border-slate-900/60"
                    >
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="font-bold text-slate-400 w-10">₹{denom}</span>
                        <span className="text-slate-600">x</span>
                        <span className="font-extrabold text-white">{count}</span>
                      </div>
                      
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => adjustCount(denom, -1)}
                          className="w-6 h-6 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 flex items-center justify-center cursor-pointer active:scale-90"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => adjustCount(denom, 1)}
                          className="w-6 h-6 rounded bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center cursor-pointer active:scale-90"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="lg:hidden text-center pt-2">
                <Link
                  href="/signup"
                  className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center cursor-pointer"
                >
                  Create Account
                </Link>
              </div>
            </div>
          </div>

        </div>

        {/* Fixed Footer */}
        <footer className="w-full max-w-6xl mx-auto px-6 py-4 flex items-center justify-between text-[11px] text-slate-500 pointer-events-auto">
          <span>&copy; {new Date().getFullYear()} ClinicFlow</span>
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>AES-256 Encrypted</span>
            </span>
            <span>•</span>
            <span ref={progressTextRef}>Progress: 0%</span>
          </div>
        </footer>
      </div>

    </div>
  );
}
