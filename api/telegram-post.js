// /api/telegram-post.js
//
// Posts a new product announcement to the BlueOval Telegram channel.
// The bot token and channel ID are read from Vercel environment
// variables (server-side only) and never sent to the browser.
//
// Required environment variables (already set for telegram-delete.js):
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHANNEL_ID
//
// Expects a POST body of: { caption, imageUrl, replyMarkup }
// Returns: { ok: true, message_id } or { ok: false, reason }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { caption, imageUrl, replyMarkup } = req.body || {};

  if (!caption) {
    return res.status(400).json({ error: 'caption is required' });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

  if (!BOT_TOKEN || !CHANNEL_ID) {
    return res.status(500).json({ error: 'Server missing Telegram configuration' });
  }

  try {
    let messageId = null;

    // Try photo post first if an image URL was provided
    if (imageUrl) {
      const body = { chat_id: CHANNEL_ID, photo: imageUrl, caption, parse_mode: 'Markdown' };
      if (replyMarkup) body.reply_markup = replyMarkup;

      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if (d.ok) messageId = d.result.message_id;
    }

    // Fall back to a text-only post if there was no image, or the photo post failed
    if (!messageId) {
      const body = { chat_id: CHANNEL_ID, text: caption, parse_mode: 'Markdown' };
      if (replyMarkup) body.reply_markup = replyMarkup;

      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if (d.ok) {
        messageId = d.result.message_id;
      } else {
        return res.status(200).json({ ok: false, reason: d.description || 'Telegram reported failure' });
      }
    }

    return res.status(200).json({ ok: true, message_id: messageId });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Telegram', details: String(err) });
  }
}
