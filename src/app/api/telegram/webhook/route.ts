import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.message && body.message.text === '/start') {
      const chatId = body.message.chat.id;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            photo: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1000&auto=format&fit=crop',
            caption: 'Добро пожаловать в JXOVO! 🎮\n\nСоздавай комнаты, приглашай друзей и выбирай самые смешные ответы. Готов начать?',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🚀 Играть сейчас',
                    url: 'https://t.me/JXOVO_bot/jxovo',
                  },
                ],
              ],
            },
          }),
        });
      } else {
        console.warn('TELEGRAM_BOT_TOKEN is not set in environment variables.');
      }
    }
  } catch (error) {
    console.error('Error handling Telegram webhook:', error);
  }

  // Always return 200 OK so Telegram doesn't retry
  return NextResponse.json({ ok: true });
}
