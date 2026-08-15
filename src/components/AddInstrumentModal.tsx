import React, { useState } from 'react';
import { X, Plus, Sparkles, Check } from 'lucide-react';
import { InstrumentConfig, AssetClass } from '../types';

interface AddInstrumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (instrument: InstrumentConfig) => void;
}

export const AddInstrumentModal: React.FC<AddInstrumentModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass>('FOREX');
  const [pipSize, setPipSize] = useState('0.0001');
  const [digits, setDigits] = useState('5');
  const [icon, setIcon] = useState('📈');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim()) return;

    const newInst: InstrumentConfig = {
      symbol: symbol.toUpperCase().trim(),
      name: name.trim() || symbol.toUpperCase().trim(),
      assetClass,
      pipSize: parseFloat(pipSize) || 0.0001,
      digits: parseInt(digits, 10) || 4,
      icon: icon || '📈',
      description: `Custom ${assetClass} instrument`,
    };

    onAdd(newInst);
    onClose();
  };

  const presets = [
    { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', class: 'FOREX' as AssetClass, pip: '0.01', dig: '3', icon: '🇯🇵' },
    { symbol: 'BTCUSD', name: 'Bitcoin / US Dollar', class: 'CRYPTO' as AssetClass, pip: '1.00', dig: '2', icon: '₿' },
    { symbol: 'ETHUSD', name: 'Ethereum / US Dollar', class: 'CRYPTO' as AssetClass, pip: '0.10', dig: '2', icon: '⟠' },
    { symbol: 'US30', name: 'Dow Jones Industrial Average', class: 'INDICES' as AssetClass, pip: '1.00', dig: '1', icon: '🏛️' },
    { symbol: 'USOIL', name: 'Crude Oil (WTI)', class: 'COMMODITIES' as AssetClass, pip: '0.01', dig: '2', icon: '🛢️' },
  ];

  const applyPreset = (p: typeof presets[0]) => {
    setSymbol(p.symbol);
    setName(p.name);
    setAssetClass(p.class);
    setPipSize(p.pip);
    setDigits(p.dig);
    setIcon(p.icon);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Add Custom Instrument</h3>
              <p className="text-[11px] text-slate-400">Track Forex, Commodities, Indices, or Crypto</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Quick Presets */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Popular Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.symbol}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-[11px] text-slate-300 font-medium transition-colors"
                >
                  {p.icon} {p.symbol}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-200 block mb-1">Symbol Ticker *</label>
              <input
                type="text"
                required
                placeholder="e.g. BTCUSD"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-200 block mb-1">Asset Class</label>
              <select
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value as AssetClass)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="FOREX">Forex</option>
                <option value="COMMODITIES">Commodities</option>
                <option value="INDICES">Indices</option>
                <option value="CRYPTO">Crypto</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-200 block mb-1">Full Instrument Name</label>
            <input
              type="text"
              placeholder="e.g. Bitcoin / US Dollar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-slate-200 block mb-1">Pip Size</label>
              <input
                type="text"
                value={pipSize}
                onChange={(e) => setPipSize(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-200 block mb-1">Price Digits</label>
              <input
                type="number"
                min="0"
                max="6"
                value={digits}
                onChange={(e) => setDigits(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-200 block mb-1">Icon Emoji</label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 text-center text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-md shadow-blue-600/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add to Watchlist</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
