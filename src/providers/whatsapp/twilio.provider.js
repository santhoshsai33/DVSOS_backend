const { getTwilioClient } = require('../../config/twilio');
const env = require('../../config/env');

class TwilioProvider {
  async sendWhatsAppMessage({ to, body }) {
    const client = getTwilioClient();

    if (!client || !env.twilio.whatsappFrom) {
      throw new Error('Twilio WhatsApp provider is not configured.');
    }

    return client.messages.create({
      from: String(env.twilio.whatsappFrom).toLowerCase().startsWith('whatsapp:')
        ? env.twilio.whatsappFrom
        : `whatsapp:${env.twilio.whatsappFrom}`,
      to,
      body
    });
  }
}

module.exports = TwilioProvider;
