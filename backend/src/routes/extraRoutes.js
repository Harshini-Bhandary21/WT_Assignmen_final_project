const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { notify } = require('../realtime');
const User = require('../models/User');
const Task = require('../models/Task');
const Habit = require('../models/Habit');
const Progress = require('../models/Progress');
const Thought = require('../models/Thought');
const Vocabulary = require('../models/Vocabulary');
const Journal = require('../models/Journal');

router.use(protect);

/* ───────── PayPal Sandbox ───────── */
const PP = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const PRICE = process.env.PREMIUM_PRICE || '4.99';
const ppToken = async () => {
  const r = await fetch(`${PP}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  return (await r.json()).access_token;
};
const ppCall = async (path, body) => {
  const r = await fetch(`${PP}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await ppToken()}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body)
  });
  return r.json();
};

router.post('/payments/create-order', async (req, res) => {
  const o = await ppCall('/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ description: 'LevelUp Premium', amount: { currency_code: 'USD', value: PRICE } }]
  });
  if (!o.id) return res.status(502).json({ success: false, message: o.message || 'PayPal order failed', details: o });
  res.json({ id: o.id });
});

router.post('/payments/capture-order', async (req, res) => {
  const c = await ppCall(`/v2/checkout/orders/${req.body.orderID}/capture`);
  if (c.status !== 'COMPLETED') return res.status(400).json({ success: false, message: 'Payment not completed', details: c });
  await User.findByIdAndUpdate(req.user._id, { isPremium: true, premiumSince: new Date() });
  notify(req.user._id);
  res.json({ success: true, premium: true });
});

/* ───────── Freeform journal ───────── */
router.get('/journal', async (req, res) => res.json(await Journal.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50)));
router.post('/journal', async (req, res) => res.status(201).json(await Journal.create({ userId: req.user._id, text: req.body.text })));
router.delete('/journal/:id', async (req, res) => { await Journal.deleteOne({ _id: req.params.id, userId: req.user._id }); res.json({ success: true }); });

/* ───────── Live leaderboard (REST fallback) ───────── */
router.get('/leaderboard', async (req, res) => {
  res.json(await User.find().sort({ totalPoints: -1 }).limit(10).select('name totalPoints level isPremium').lean());
});

/* ───────── RAG AI Coach ───────── */
// 1) Build a corpus from the user's own data + vocab bank  2) retrieve by BM25-lite  3) ground the LLM
const tok = (s) => (s.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
const retrieve = (docs, q, k = 6) => {
  const qt = new Set(tok(q));
  const df = {};
  docs.forEach((d) => new Set(d.t).forEach((w) => (df[w] = (df[w] || 0) + 1)));
  return docs
    .map((d) => ({ ...d, s: d.t.reduce((a, w) => a + (qt.has(w) ? Math.log(1 + docs.length / df[w]) : 0), 0) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k);
};

router.post('/coach', async (req, res) => {
  if (!req.user.isPremium) return res.status(402).json({ success: false, message: 'Premium required' });
  const q = (req.body.question || '').slice(0, 500);
  const uid = req.user._id;
  const [tasks, habits, prog, thoughts, vocab, journal] = await Promise.all([
    Task.find({ userId: uid }).sort({ createdAt: -1 }).limit(40).lean(),
    Habit.find({ userId: uid }).lean(),
    Progress.find({ userId: uid }).sort({ createdAt: -1 }).limit(40).lean(),
    Thought.find({ userId: uid }).sort({ createdAt: -1 }).limit(20).lean(),
    Vocabulary.find().limit(100).lean(),
    Journal.find({ userId: uid }).sort({ createdAt: -1 }).limit(30).lean()
  ]);
  const texts = [
    `Profile: ${req.user.name}, level ${req.user.level}, ${req.user.totalPoints} XP, streak ${req.user.currentStreak} days (best ${req.user.longestStreak})`,
    ...tasks.map((t) => `Task "${t.title}" priority ${t.priority} ${t.completed ? 'completed' : 'pending'} on ${t.date}`),
    ...habits.map((h) => `Habit "${h.name}" (${h.category}) streak ${h.currentStreak}, best ${h.longestStreak}, done ${h.completedDates?.length || 0} days`),
    ...prog.map((p) => `Activity ${p.category}: ${p.title} (+${p.pointsEarned} XP) on ${p.date}`),
    ...thoughts.map((t) => `Reflection "${t.question}": ${t.answer || ''}`),
    ...journal.map((j) => `Journal entry on ${j.createdAt.toISOString().slice(0, 10)}: ${j.text}`),
    ...vocab.map((v) => `Vocabulary word ${v.word}: ${v.meaning}. Example: ${v.example}`)
  ];
  const hits = retrieve(texts.map((t) => ({ t: tok(t), text: t })), q);
  const context = hits.map((h, i) => `[${i + 1}] ${h.text}`).join('\n');

  let answer;
  if (process.env.GEMINI_API_KEY) {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: 'You are LevelUp Coach, a concise, encouraging personal-growth and English-communication coach. Answer ONLY using the numbered context about this user when it is relevant; cite sources like [1]. Keep it under 120 words.' }] },
      generationConfig: { maxOutputTokens: 350, thinkingConfig: { thinkingLevel: 'minimal' } },
      contents: [{ role: 'user', parts: [{ text: `Context:\n${context}\n\nQuestion: ${q}` }] }]
    });
    // Try the configured model, then fall back if it is overloaded/unavailable
    const models = [...new Set([process.env.COACH_MODEL, 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'].filter(Boolean))];
    for (const m of models) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
          method: 'POST', body, signal: AbortSignal.timeout(10000),
          headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' }
        });
        const j = await r.json();
        const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
        if (text) { answer = text; break; }
      } catch { /* timeout / network: try next model */ }
    }
    answer = answer || 'The AI model is busy right now — here are the most relevant items I found for you.';
  } else {
    answer = 'GEMINI_API_KEY not set — showing retrieved context only.';
  }
  res.json({ answer, sources: hits.map((h, i) => ({ n: i + 1, text: h.text, score: +h.s.toFixed(2) })) });
});

module.exports = router;
