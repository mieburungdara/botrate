const { Telegraf } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN, {
    telegram: { webhookReply: true }
});

module.exports = bot;
