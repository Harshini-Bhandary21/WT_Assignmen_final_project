import React, { useState } from 'react';
import { Radio, Trophy, Crown } from 'lucide-react';

// Floating live panel: online users + realtime leaderboard
const LiveWidget = ({ online, board, meId }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="fixed bottom-4 right-4 z-40 w-64 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl text-sm">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-2.5 font-bold text-slate-700 dark:text-slate-200">
        <span className="flex items-center gap-2"><Radio className="w-4 h-4 text-emerald-500 animate-pulse" /> Live · {online} online</span>
        <Trophy className="w-4 h-4 text-amber-500" />
      </button>
      {open && (
        <ol className="px-4 pb-3 space-y-1.5">
          {board.slice(0, 5).map((u, i) => (
            <li key={u._id} className={`flex justify-between ${u._id === meId ? 'text-indigo-600 font-bold' : 'text-slate-600 dark:text-slate-300'}`}>
              <span className="truncate flex items-center gap-1">{i + 1}. {u.name}{u.isPremium && <Crown className="w-3 h-3 text-amber-500" />}</span>
              <span className="font-mono">{u.totalPoints}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
export default LiveWidget;
