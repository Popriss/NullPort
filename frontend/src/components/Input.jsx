import React from 'react';

export default function Input({ label, error, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
          {label}
        </label>
      )}
      <input
        className={`w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-emerald-500/20 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all ${
          error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/50' : ''
        } ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-rose-400 mt-1 block">{error}</span>}
    </div>
  );
}
