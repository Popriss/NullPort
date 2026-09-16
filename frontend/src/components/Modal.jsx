import React from 'react';

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-zinc-100">{title}</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
