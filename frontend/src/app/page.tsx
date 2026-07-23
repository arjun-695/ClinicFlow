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
  ChevronDown,
  Activity,
  Database,
  Search,
  FileText,
  CheckCheck,
  Smartphone,
  RotateCcw,
  Lock
} from "lucide-react";
import { fetchAPI } from "../utils/api";

export default function LandingPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
 
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

  // Mock Patient Data for EMR Cache Simulator
  const mockPatients = [
    { id: 1, name: "Arjun Tandon", phone: "+91 7777777777", age: 28, gender: "Male", medicalHistory: "Chronic allergy, seasonal asthma", balance: 150 },
    { id: 2, name: "Priya Sharma", phone: "+91 9876543210", age: 34, gender: "Female", medicalHistory: "Routine checkup, vitamins prescribed", balance: 0 },
    { id: 3, name: "Amit Verma", phone: "+91 9369732522", age: 42, gender: "Male", medicalHistory: "Mild hypertension, under daily meds", balance: 500 },
  ];

  // EMR Cache Simulator State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);

  // WhatsApp Dispatch Simulator State
  const [chatSent, setChatSent] = useState(false);

  const filteredMockPatients = mockPatients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
 
  // 1. Verify auth session in background without blocking initial page render
  useEffect(() => {
    const checkSession = async () => {
      try {
        const data = await fetchAPI("/api/auth/session");
        if (data.status === "Authenticated") {
          setIsAuthenticated(true);
        }
      } catch {
        // ignore
      }
    };
    checkSession();
  }, []);

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

  // 4. Hardware-Accelerated Animation Loop (requestAnimationFrame + Lerp)
  useEffect(() => {
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
  }, []);

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

  return (
    <div className="min-h-[500vh] bg-[#030712] text-slate-100 font-sans selection:bg-indigo-500 selection:text-white relative">
      
      {/* 1. FIXED VIDEO BACKDROP: Hardware-accelerated looped background video playing continuously */}
      <div className="fixed inset-0 w-full h-screen z-0 overflow-hidden select-none pointer-events-none">
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster="/background.jpg"
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/Doctor_folding_hands_final_pose_202606091414.mp4" type="video/mp4" />
        </video>
        
        {/* Dark radial overlay to ensure high readability of overlay cards */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#030712]/95 via-[#030712]/75 to-[#030712]/95" />
      </div>

      {/* 2. FIXED STICKY INTERFACE CONTAINER: Holds static menus and scrolling pages */}
      <div className="fixed inset-0 w-full h-screen z-10 pointer-events-none flex flex-col justify-between">
        
        {/* Fixed Header */}
        <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg transform transition hover:rotate-12 duration-300">
              <span className="font-black text-white text-base">CL</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Clinically</h3>
              <p className="text-[9px] font-semibold text-indigo-400 tracking-wider uppercase">Patient EMR & Billing</p>
            </div>
          </div>

          <nav className="flex items-center space-x-4">
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="px-4.5 py-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-xs font-semibold text-white shadow-md hover:shadow-indigo-500/20 active:scale-[0.98] transition duration-300 pointer-events-auto"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
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
              </>
            )}
          </nav>
        </header>

        {/* Dynamic Scrollytelling Panels Container */}
        <div className="flex-grow w-full max-w-6xl mx-auto px-6 relative flex items-center justify-center">
          
          {/* SECTION 0: Hero Panel (visible around 8% scroll) */}
          <div 
            ref={(el) => { sectionRefs.current[0] = el; }}
            style={{ display: "none" }}
            className="absolute inset-0 flex flex-col lg:flex-row items-center justify-center max-w-5xl mx-auto gap-8 overflow-y-auto max-h-[85vh] py-4 pointer-events-auto animate-fadeIn"
          >
            {/* Left side: Texts */}
            <div className="text-center lg:text-left space-y-5 lg:w-1/2 flex flex-col items-center lg:items-start">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-900/50 text-xs font-semibold text-indigo-300">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Modern Digital Records & Easy Scheduling</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-extrabold leading-tight text-white tracking-tight">
                Streamline Your <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400">Clinic Practice</span> With Clinically.
              </h1>
              
              <p className="text-sm text-slate-400 leading-relaxed max-w-md">
                Ditch paper files and manual lookup. Focus on patient care while Clinically handles appointment scheduling, digital prescriptions, and automatic WhatsApp invoice delivery.
              </p>

              <div className="flex items-center space-x-4 pt-2">
                <Link
                  href="/signup"
                  className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-purple-600 hover:to-indigo-500 text-white font-bold text-center text-sm shadow-xl hover:shadow-indigo-500/20 active:scale-[0.98] transition-all duration-300 flex items-center space-x-2 group"
                >
                  <span>Create Doctor Account</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center text-slate-500 animate-bounce lg:hidden">
                <span className="text-[10px] uppercase font-bold tracking-widest mb-1">Scroll to explore</span>
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Right side: Mock Dashboard Card */}
            <div className="w-full max-w-sm backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold text-slate-300">Practice Dashboard</span>
                </div>
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-900/40 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping mr-1" />
                  <span>ONLINE</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/50 border border-slate-900/60 rounded-xl p-3">
                  <span className="text-[9px] text-slate-500 font-semibold uppercase">Digital Records</span>
                  <div className="text-sm font-extrabold text-white mt-0.5 flex items-center space-x-1">
                    <Database className="w-3.5 h-3.5 text-indigo-400" />
                    <span>15,000+ Saved</span>
                  </div>
                </div>
                <div className="bg-slate-950/50 border border-slate-900/60 rounded-xl p-3">
                  <span className="text-[9px] text-slate-500 font-semibold uppercase">Auto WhatsApp</span>
                  <div className="text-sm font-extrabold text-white mt-0.5 flex items-center space-x-1">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Instant Receipts</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/50 border border-slate-800/40 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Time Saved on Patient Care</span>
                  <span className="text-indigo-400 font-bold">98.4% Faster</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 rounded-full" style={{ width: '98.4%' }} />
                </div>
                <div className="flex justify-between text-[9px] text-slate-500">
                  <span>Instant Patient Lookup</span>
                  <span>Paperless Workflows</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 bg-slate-950/20 p-2.5 rounded-xl border border-slate-900/60 flex items-center space-x-2">
                <Lock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Secure, HIPAA-compliant patient files</span>
              </div>
            </div>
          </div>

          {/* SECTION 1: EMR Records (visible around 38% scroll) */}
          <div 
            ref={(el) => { sectionRefs.current[1] = el; }}
            style={{ display: "none" }}
            className="absolute inset-0 flex flex-col lg:flex-row items-center justify-center max-w-5xl mx-auto gap-8 overflow-y-auto max-h-[85vh] py-4 pointer-events-auto animate-fadeIn"
          >
            {/* Left side: Texts */}
            <div className="text-center lg:text-left space-y-4 lg:w-1/2 flex flex-col items-center lg:items-start">
              <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 text-indigo-400">
                <BookOpen className="w-6 h-6" />
              </div>
              
              <h2 className="text-3xl font-bold text-white tracking-tight">
                Say Goodbye to Misplaced Records
              </h2>
              
              <p className="text-sm text-slate-400 leading-relaxed max-w-md">
                Access a patient's entire medical history in one tap. View past diagnoses, treatment notes, prescriptions, and lab files instantly, without searching through physical filing cabinets.
              </p>

              <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl backdrop-blur-md max-w-md text-left hidden lg:block">
                <p className="text-xs text-slate-500 italic">
                  "We used to spend hours searching through old paper folders. Now, we open a patient's complete history in less than a second."
                </p>
              </div>
            </div>

            {/* Right side: Live Patient Folder Simulator */}
            <div className="w-full max-w-sm backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                <span className="text-xs font-bold text-slate-300">Instant Patient Lookup</span>
                <span className="text-[9px] font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-900/40 flex items-center space-x-1">
                  <Database className="w-3 h-3 text-indigo-400" />
                  <span>PATIENT FILE</span>
                </span>
              </div>

              {/* Input Box */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search patient by name or phone..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    if (e.target.value && filteredMockPatients.length > 0) {
                      setSelectedPatientId(filteredMockPatients[0].id);
                    } else if (!e.target.value) {
                      setSelectedPatientId(null);
                    }
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950/70 border border-slate-850 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500/80 transition"
                />
              </div>

              {/* Results */}
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {filteredMockPatients.length > 0 ? (
                  filteredMockPatients.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPatientId(p.id)}
                      className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                        selectedPatientId === p.id
                          ? "bg-indigo-600/10 border-indigo-500/50"
                          : "bg-slate-950/30 border-slate-900/60 hover:bg-slate-950/60"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-200">{p.name}</div>
                        <div className="text-[10px] text-slate-500">{p.phone}</div>
                      </div>
                      <span className="text-[9px] font-semibold text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-900">
                        {p.age} yrs
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-xs text-slate-500 py-4">No patient record found</div>
                )}
              </div>

              {/* Detail Card with lookup speed */}
              {selectedPatientId !== null && (
                <div className="bg-slate-950/70 border border-slate-800/40 rounded-xl p-3 space-y-2 animate-fadeIn">
                  <div className="flex justify-between items-center text-[10px] border-b border-slate-900 pb-1.5">
                    <span className="text-slate-500 font-bold">Patient Summary</span>
                    <span className="text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/30">
                      ⚡ Found Instantly (under 1 sec)
                    </span>
                  </div>
                  {(() => {
                    const p = mockPatients.find(x => x.id === selectedPatientId);
                    if (!p) return null;
                    return (
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Prescriptions & Notes:</span>
                          <span className="text-slate-200 font-medium truncate max-w-[160px]">{p.medicalHistory}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Pending Dues:</span>
                          <span className={`${p.balance > 0 ? 'text-red-400' : 'text-slate-300'} font-bold`}>
                            ₹{p.balance}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: WhatsApp Receipts (visible around 68% scroll) */}
          <div 
            ref={(el) => { sectionRefs.current[2] = el; }}
            style={{ display: "none" }}
            className="absolute inset-0 flex flex-col lg:flex-row items-center justify-center max-w-5xl mx-auto gap-8 overflow-y-auto max-h-[85vh] py-4 pointer-events-auto animate-fadeIn"
          >
            {/* Left side: Texts */}
            <div className="text-center lg:text-left space-y-4 lg:w-1/2 flex flex-col items-center lg:items-start">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <MessageSquare className="w-6 h-6" />
              </div>
              
              <h2 className="text-3xl font-bold text-white tracking-tight">
                Paperless WhatsApp Receipts
              </h2>
              
              <p className="text-sm text-slate-400 leading-relaxed max-w-md">
                Instantly send digital PDF prescriptions and invoices directly to your patient's WhatsApp. Keep your practice modern and eco-friendly while ensuring patients never lose their medical receipts or dosage instructions.
              </p>

              <div className="flex items-center space-x-3 px-4 py-2 bg-emerald-950/30 border border-emerald-900/40 rounded-full text-xs text-emerald-400">
                <Zap className="w-4 h-4 animate-pulse" />
                <span className="font-semibold">Polite automated payment reminders are sent to patients automatically</span>
              </div>
            </div>

            {/* Right side: WhatsApp Simulator */}
            <div className="w-full max-w-sm flex flex-col items-center">
              <div className="w-64 h-96 border border-slate-800 bg-slate-950 rounded-[36px] p-2.5 shadow-2xl relative overflow-hidden flex flex-col justify-between">
                
                {/* Phone Header */}
                <div className="border-b border-slate-900 pb-1.5 flex items-center space-x-2 px-2 pt-1">
                  <Smartphone className="w-4 h-4 text-slate-500" />
                  <span className="text-[10px] text-slate-300 font-bold">WhatsApp • Patient Chat</span>
                </div>

                {/* Chat Area */}
                <div className="flex-grow p-2 overflow-y-auto space-y-2 flex flex-col justify-end">
                  
                  {/* Left Patient Message */}
                  <div className="bg-slate-900 border border-slate-800 text-[10px] text-slate-300 p-2 rounded-2xl max-w-[85%] self-start rounded-tl-none">
                    Can you please send me my prescription and receipt copy?
                  </div>

                  {/* Right PDF Dispatch Message (Animated/Conditional) */}
                  {chatSent ? (
                    <div className="bg-emerald-950/50 border border-emerald-900/50 text-[10px] text-slate-200 p-2 rounded-2xl max-w-[85%] self-end rounded-tr-none space-y-1.5 animate-slideUp">
                      <div className="flex items-center space-x-2 bg-emerald-900/30 p-1.5 rounded-xl border border-emerald-800/30">
                        <FileText className="w-5 h-5 text-emerald-400" />
                        <div className="overflow-hidden">
                          <div className="font-bold truncate text-[9px] text-white">Receipt & Prescription.pdf</div>
                          <div className="text-[8px] text-emerald-400/80">Official Medical Invoice</div>
                        </div>
                      </div>
                      <p className="text-[9px] leading-tight text-slate-300">
                        Hi Arjun, here is your prescription summary and receipt copy for today's visit. Regards, Dr. Sharma.
                      </p>
                      <div className="flex justify-end items-center space-x-0.5">
                        <span className="text-[8px] text-slate-500">12:41 PM</span>
                        <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-[10px] text-slate-600 py-4 font-semibold italic">
                      Click button below to simulate sending receipt
                    </div>
                  )}
                </div>

                {/* Send Trigger Button */}
                <div className="pt-2 border-t border-slate-900">
                  <button
                    onClick={() => setChatSent(!chatSent)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1 transition cursor-pointer"
                  >
                    {chatSent ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Simulator</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Send Receipt to Patient</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: Denomination Calculator (visible around 94% scroll) */}
          <div 
            ref={(el) => { sectionRefs.current[3] = el; }}
            style={{ display: "none" }}
            className="absolute inset-0 flex flex-col lg:flex-row items-center justify-center max-w-5xl mx-auto gap-8 overflow-y-auto max-h-[85vh] py-4 pointer-events-auto animate-fadeIn"
          >
            {/* Texts */}
            <div className="text-center lg:text-left space-y-4 lg:w-1/2 flex flex-col items-center lg:items-start">
              <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 justify-center">
                <IndianRupee className="w-6 h-6" />
              </div>
              <h2 className="text-3xl font-bold text-white tracking-tight">
                Accurate Cash Counter
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed max-w-md">
                Never miscalculate cash payments at the front desk. Tap on-screen notes to count cash totals instantly, keeping your daily register accurate and helping your clinic staff avoid calculation errors.
              </p>
              <div className="pt-2 hidden lg:block">
                <Link
                  href="/signup"
                  className="inline-flex px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs active:scale-95 transition cursor-pointer"
                >
                  Start Billing Patients
                </Link>
              </div>
            </div>

            {/* Interactive Calculator Card */}
            <div className="w-full max-w-sm backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-3xl p-5 shadow-2xl space-y-4 select-none">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Cash Desk Assistant</span>
                <span className="text-[9px] font-semibold text-slate-500 bg-slate-950 px-2 py-0.5 rounded-full">Interactive</span>
              </div>

              {/* Total Display */}
              <div className="bg-slate-950/70 border border-slate-800/60 rounded-xl p-3.5 text-center">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Cash Drawer Total</span>
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
          <span>&copy; {new Date().getFullYear()} Clinically</span>
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>Bank-Grade Security & Encrypted</span>
            </span>
            <span>•</span>
            <span ref={progressTextRef}>Progress: 0%</span>
          </div>
        </footer>
      </div>

    </div>
  );
}
