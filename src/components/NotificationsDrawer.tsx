import React from 'react';
import { X, Bell, CheckCircle2, XCircle, AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import { SignalNotification } from '../types';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: SignalNotification[];
  onClear: () => void;
  onMarkAllRead: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onClear,
  onMarkAllRead,
}) => {
  if (!isOpen) return null;

  const getIcon = (type: SignalNotification['type']) => {
    switch (type) {
      case 'NEW_SIGNAL':
        return <Sparkles className="w-4 h-4 text-blue-400" />;
      case 'TP1_HIT':
      case 'TP2_HIT':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'SL_HIT':
        return <XCircle className="w-4 h-4 text-rose-400" />;
      case 'INVALIDATED':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      default:
        return <Bell className="w-4 h-4 text-blue-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-xs">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-400" />
            <h3 className="font-bold text-sm text-white">Signal Alerts & Activity Feed</h3>
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                onClick={onClear}
                className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                title="Clear All Notifications"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs">
              <Bell className="w-8 h-8 text-slate-600 mb-2 opacity-40" />
              <p>No new signal alerts</p>
              <p className="text-[11px] text-slate-600 mt-1">
                New signals, target hits, and invalidations will appear here in real time.
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-3 rounded-lg border text-xs transition-all ${
                  !n.read
                    ? 'bg-slate-800/90 border-blue-500/50 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5">{getIcon(n.type)}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-100">{n.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{n.message}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="p-3 border-t border-slate-800 bg-slate-950/60 text-center">
            <button
              onClick={onMarkAllRead}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              Mark all as read
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
