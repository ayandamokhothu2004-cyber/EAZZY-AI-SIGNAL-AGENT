import React, { useState } from 'react';
import { X, Shield, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { RiskSettings } from '../types';

interface RiskSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: RiskSettings;
  onSave: (newSettings: RiskSettings) => void;
}

export const RiskSettingsModal: React.FC<RiskSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [form, setForm] = useState<RiskSettings>({ ...settings });

  if (!isOpen) return null;

  const handleReset = () => {
    setForm({
      maxRiskPerTradePercent: 1.0,
      minRiskReward: 1.5,
      maxSimultaneousSignals: 4,
      maxDailySignals: 10,
      maxConsecutiveLosses: 3,
      maxDailyDrawdownPercent: 3.0,
      minConfidenceRequired: 60,
    });
  };

  const handleSave = () => {
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Risk Management & Engine Rules</h3>
              <p className="text-[11px] text-slate-400">Enforce quantitative discipline and signal filtration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Min R:R Ratio */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-200">
                Minimum Risk/Reward Ratio (R:R)
              </label>
              <span className="font-mono font-bold text-emerald-400">1:{form.minRiskReward.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="4.0"
              step="0.1"
              value={form.minRiskReward}
              onChange={(e) => setForm({ ...form, minRiskReward: parseFloat(e.target.value) })}
              className="w-full accent-blue-600 bg-slate-800"
            />
            <p className="text-[11px] text-slate-400">
              Signals with reward-to-risk below this threshold will automatically default to "WAIT — NO VALID SETUP".
            </p>
          </div>

          {/* Min AI Confidence */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-200">
                Minimum AI Confidence Required (0–100)
              </label>
              <span className="font-mono font-bold text-blue-400">{form.minConfidenceRequired}/100</span>
            </div>
            <input
              type="range"
              min="40"
              max="90"
              step="5"
              value={form.minConfidenceRequired}
              onChange={(e) => setForm({ ...form, minConfidenceRequired: parseInt(e.target.value, 10) })}
              className="w-full accent-blue-600 bg-slate-800"
            />
            <p className="text-[11px] text-slate-400">
              Filter out low-confluence signals. 60+ is recommended for disciplined trading.
            </p>
          </div>

          {/* Max Risk Per Trade */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div>
              <label className="font-semibold text-slate-200 block mb-1">
                Max Risk Per Trade (%)
              </label>
              <input
                type="number"
                min="0.25"
                max="5.0"
                step="0.25"
                value={form.maxRiskPerTradePercent}
                onChange={(e) => setForm({ ...form, maxRiskPerTradePercent: parseFloat(e.target.value) || 1.0 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-200 block mb-1">
                Max Daily Drawdown (%)
              </label>
              <input
                type="number"
                min="1.0"
                max="10.0"
                step="0.5"
                value={form.maxDailyDrawdownPercent}
                onChange={(e) => setForm({ ...form, maxDailyDrawdownPercent: parseFloat(e.target.value) || 3.0 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Max Consecutive Losses & Limits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-200 block mb-1">
                Max Consecutive Losses
              </label>
              <input
                type="number"
                min="1"
                max="5"
                value={form.maxConsecutiveLosses}
                onChange={(e) => setForm({ ...form, maxConsecutiveLosses: parseInt(e.target.value, 10) || 3 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-200 block mb-1">
                Max Daily Signals Allowed
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={form.maxDailySignals}
                onChange={(e) => setForm({ ...form, maxDailySignals: parseInt(e.target.value, 10) || 10 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/50">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-md shadow-blue-600/20"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Risk Rules</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
