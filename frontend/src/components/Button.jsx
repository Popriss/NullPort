import React from 'react';

export default function Button({
  children,
  variant = 'primary',
  className = '',
  loading = false,
  ...props
}) {
  const base = "relative inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-semibold tracking-wide transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#050a08] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none";
  const variants = {
    primary: "bg-[#10b981] hover:bg-[#34d399] text-[#050a08] font-bold focus:ring-[#10b981] shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:shadow-[0_0_28px_rgba(16,185,129,0.4)] active:scale-[0.98]",
    secondary: "bg-black/50 hover:bg-zinc-900 text-zinc-300 border border-emerald-500/20 hover:border-emerald-500/40 focus:ring-emerald-500",
    danger: "bg-rose-600 hover:bg-rose-500 text-white focus:ring-rose-500 shadow-lg shadow-rose-900/30",
    ghost: "bg-transparent hover:bg-emerald-500/10 text-emerald-400 border border-transparent hover:border-emerald-500/20",
  };

  return (
    <button
      className={`${base} ${variants[variant] || variants.primary} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1"></span>
      )}
      {children}
    </button>
  );
}
