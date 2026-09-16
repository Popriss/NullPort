import React from 'react';

export default function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = "px-4 py-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-emerald-600 hover:bg-emerald-500 text-white focus:ring-emerald-500 shadow-lg shadow-emerald-900/30",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 focus:ring-zinc-500",
    danger: "bg-rose-600 hover:bg-rose-500 text-white focus:ring-rose-500",
    ghost: "bg-transparent hover:bg-zinc-800 text-zinc-300",
  };

  return (
    <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}
