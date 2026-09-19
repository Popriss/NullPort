import React from 'react';

export default function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = "px-4 py-2.5 rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#050a08] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
  const variants = {
    primary: "bg-[#10b981] hover:bg-[#34d399] text-[#050a08] font-bold focus:ring-[#10b981] shadow-lg shadow-emerald-500/20 active:scale-[0.98]",
    secondary: "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-emerald-500/20 focus:ring-emerald-500",
    danger: "bg-rose-600 hover:bg-rose-500 text-white focus:ring-rose-500 shadow-lg shadow-rose-900/30",
    ghost: "bg-transparent hover:bg-zinc-800 text-zinc-300",
  };

  return (
    <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}
