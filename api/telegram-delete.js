// /api/telegram-delete.js
//
// Deletes a message from the BlueOval Telegram channel.
// The bot token and channel ID are read from Vercel environment
// variables (server-side only) and never sent to the browser.
//
// Required environment variables (set in Vercel dashboard under
// Project → Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHANNEL_ID

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message_id } = req.body || {};

  if (!message_id) {
    return res.status(400).json({ error: 'message_id is required' });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

  if (!BOT_TOKEN || !CHANNEL_ID) {
    return res.status(500).json({ error: 'Server missing Telegram configuration' });
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHANNEL_ID,
        message_id: parseInt(message_id, 10)
      })
    });

    const data = await tgRes.json();

    if (!data.ok) {
      // Telegram responded but reported failure (e.g. message already
      // deleted, or bot lacks permission) — pass that reason back so
      // the admin panel can show a meaningful error instead of a
      // generic failure.
      return res.status(200).json({ ok: false, reason: data.description || 'Telegram reported failure' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Telegram', details: String(err) });
  }
}
