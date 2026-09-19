import React, { useState } from 'react';

/**
 * Input — Componente Minimalista & Tech
 * 
 * Suporta label monospace estilizada com `//`, ícone prefixo,
 * toggle de visibilidade de senha interativo e bordas esmeralda sutis.
 */
export default function Input({
  label,
  error,
  icon,
  type = 'text',
  className = '',
  ...props
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label className="block text-[11px] font-mono tracking-wider text-zinc-400 select-none">
          <span className="text-emerald-500/80 font-bold mr-1.5">//</span>
          <span className="uppercase">{label}</span>
        </label>
      )}
      
      <div className="relative flex items-center group">
        {icon && (
          <span className="absolute left-3.5 text-zinc-500 text-xs pointer-events-none select-none group-focus-within:text-emerald-400 transition-colors">
            {icon}
          </span>
        )}

        <input
          type={inputType}
          className={`w-full ${icon ? 'pl-9' : 'px-3.5'} ${isPassword ? 'pr-10' : 'pr-3.5'} py-2.5 rounded-xl bg-black/50 border border-emerald-500/20 text-zinc-100 placeholder-zinc-600 text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40 focus:bg-black/70 transition-all font-sans ${
            error ? 'border-rose-500/80 focus:border-rose-500 focus:ring-rose-500/30' : ''
          } ${className}`}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            title={showPassword ? "Ocultar senha" : "Ver senha"}
            className="absolute right-3 p-1 text-zinc-500 hover:text-zinc-200 text-xs rounded transition-colors cursor-pointer select-none"
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        )}
      </div>

      {error && (
        <span className="text-[11px] font-mono text-rose-400 mt-1 flex items-center gap-1.5">
          <span>⚠️</span> {error}
        </span>
      )}
    </div>
  );
}
