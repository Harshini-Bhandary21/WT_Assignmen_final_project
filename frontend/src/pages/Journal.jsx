import React, { useEffect, useState } from 'react';
import API from '../services/api';
import { PenLine, Trash2 } from 'lucide-react';

// Freeform journal: write anything; the AI Coach (RAG) retrieves from these entries
const Journal = () => {
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');
  const load = () => API.get('/journal').then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await API.post('/journal', { text });
    setText('');
    load();
  };
  const del = async (id) => { await API.delete(`/journal/${id}`); load(); };

  const card = 'rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5';
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-extrabold flex items-center gap-2 text-slate-900 dark:text-white"><PenLine className="text-indigo-500" /> Freeform Journal</h1>
      <form onSubmit={save} className={card}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Write freely — wins, struggles, ideas…"
          className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm" />
        <button className="mt-3 px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Save entry</button>
      </form>
      {items.map((j) => (
        <div key={j._id} className={`${card} flex justify-between gap-4`}>
          <div>
            <p className="text-xs text-slate-400 mb-1">{new Date(j.createdAt).toLocaleString()}</p>
            <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-200">{j.text}</p>
          </div>
          <button onClick={() => del(j._id)} className="text-rose-500 self-start"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
};
export default Journal;
