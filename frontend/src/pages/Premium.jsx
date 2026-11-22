import React, { useEffect, useRef, useState } from 'react';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Crown, Send, Sparkles, FileText } from 'lucide-react';

let sdk; // load the SDK once (React StrictMode runs effects twice)
const loadPayPal = (clientId) =>
  (sdk ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
    s.onload = res;
    s.onerror = () => { sdk = null; rej(new Error('PayPal SDK failed to load')); };
    document.body.appendChild(s);
  }));

const Premium = () => {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const btn = useRef();
  const [q, setQ] = useState('');
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);

  // PayPal sandbox buttons
  useEffect(() => {
    if (user?.isPremium) return;
    let btns, dead = false;
    loadPayPal(import.meta.env.VITE_PAYPAL_CLIENT_ID).then(() => {
      if (dead || !btn.current) return;
      btns = window.paypal.Buttons({
        createOrder: async () => (await API.post('/payments/create-order')).data.id,
        onApprove: async (d) => {
          await API.post('/payments/capture-order', { orderID: d.orderID });
          updateUser({ isPremium: true });
          showToast('Welcome to Premium! 👑', 'success');
        },
        onError: (e) => showToast(e?.message || 'Payment failed', 'error')
      });
      btns.render(btn.current);
    }).catch((e) => showToast(e.message, 'error'));
    return () => { dead = true; btns?.close?.(); };
  }, [user?.isPremium]);

  const ask = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    const question = q; setQ(''); setBusy(true);
    setChat((c) => [...c, { role: 'user', text: question }]);
    try {
      const { data } = await API.post('/coach', { question });
      setChat((c) => [...c, { role: 'ai', text: data.answer, sources: data.sources }]);
    } catch (err) {
      setChat((c) => [...c, { role: 'ai', text: err.response?.data?.message || 'Error' }]);
    }
    setBusy(false);
  };

  const card = 'rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6';
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-extrabold flex items-center gap-2 text-slate-900 dark:text-white">
        <Crown className="text-amber-500" /> LevelUp Premium
      </h1>

      {!user?.isPremium && (
        <div className={card}>
          <p className="font-bold text-slate-800 dark:text-slate-100">Unlock the AI Coach — $4.99 (PayPal Sandbox)</p>
          <p className="text-sm text-slate-500 mb-4">A RAG coach that answers from your own tasks, habits, activity and reflections.</p>
          <div ref={btn} className="max-w-xs" />
        </div>
      )}

      <div className={card}>
        <p className="font-bold mb-3 flex items-center gap-2 text-slate-800 dark:text-slate-100"><Sparkles className="w-4 h-4 text-indigo-500" /> AI Coach (RAG)</p>
        <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
          {chat.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
              <div className={`inline-block px-3 py-2 rounded-xl text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 dark:text-slate-100'}`}>{m.text}</div>
              {m.sources?.length > 0 && (
                <details className="text-xs text-slate-500 mt-1">
                  <summary className="cursor-pointer flex items-center gap-1"><FileText className="w-3 h-3" /> {m.sources.length} retrieved sources</summary>
                  {m.sources.map((s) => <p key={s.n}>[{s.n}] {s.text} <i>({s.score})</i></p>)}
                </details>
              )}
            </div>
          ))}
          {busy && <p className="text-sm text-slate-400 animate-pulse">Retrieving & thinking…</p>}
        </div>
        <form onSubmit={ask} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!user?.isPremium}
            placeholder={user?.isPremium ? 'e.g. Which habit should I focus on?' : 'Upgrade to chat'}
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm" />
          <button disabled={!user?.isPremium || busy} className="px-4 rounded-xl bg-indigo-600 text-white disabled:opacity-40"><Send className="w-4 h-4" /></button>
        </form>
      </div>
    </div>
  );
};
export default Premium;
