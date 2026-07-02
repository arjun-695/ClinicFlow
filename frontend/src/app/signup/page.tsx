import React from "react";
import HeaderSimple from "../../components/HeaderSimple";
import AuthForm from "../../components/AuthForm";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 relative overflow-hidden flex flex-col justify-between">
      {/* Dynamic Blurred Background Image */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center filter blur-[15px] scale-[1.05] opacity-25 animate-bg-pan-zoom"
          style={{ backgroundImage: "url('/background.jpg')" }}
        />
        {/* Shadow Overlay */}
        <div className="absolute inset-0 bg-[#090d16]/70" />
      </div>

      <HeaderSimple />
      
      <main className="flex-grow flex items-center justify-center px-6 py-8 relative z-10 w-full">
        <AuthForm variant="signup" />
      </main>

      <footer className="w-full text-center py-6 text-xs text-slate-600 relative z-10">
        &copy; {new Date().getFullYear()} Clinically. Secure Patient EMR & Ledger.
      </footer>
    </div>
  );
}
