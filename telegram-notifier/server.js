const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// ================= TELEGRAM CONFIGURATION =================
// IMPORTANT: Replace these with your actual values
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Initialize Telegram Bot
let bot;
let botReady = false;

try {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required');
  }
  bot = new TelegramBot(BOT_TOKEN, { polling: false });
  botReady = true;
  console.log('✅ Telegram Bot initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Telegram Bot:', error.message);
  console.log('⚠️  Service will run but notifications will be disabled');
}

// ================= HELPER FUNCTIONS =================

// Format activity message with emoji and details
function formatMessage(type, message, icon) {
  const timestamp = new Date().toLocaleString('en-IN', { 
    timeZone: 'Asia/Calcutta',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  
  return `${icon} *Activity Alert*\n\n` +
         `*Type:* ${type}\n` +
         `*Details:* ${message}\n` +
         `*Time:* ${timestamp}`;
}

// Send Telegram notification
async function sendTelegramNotification(type, message, icon = '📝') {
  if (!botReady) {
    console.log('⚠️  Telegram bot not ready, skipping notification');
    return { success: false, error: 'Bot not initialized' };
  }

  try {
    const formattedMessage = formatMessage(type, message, icon);
    
    await bot.sendMessage(CHAT_ID, formattedMessage, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    
    console.log(`✅ Telegram notification sent: ${type} - ${message}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send Telegram notification:', error.message);
    return { success: false, error: error.message };
  }
}

// ================= API ROUTES =================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'running',
    botReady: botReady,
    timestamp: new Date().toISOString()
  });
});

// Send notification endpoint
app.post('/notify', async (req, res) => {
  const { type, message, icon } = req.body;

  // Validate input
  if (!type || !message) {
    return res.status(400).json({
      error: 'Missing required fields: type and message are required'
    });
  }

  // Send notification
  const result = await sendTelegramNotification(type, message, icon);

  if (result.success) {
    res.json({
      success: true,
      message: 'Notification sent successfully'
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
});

// Batch notifications endpoint (for multiple notifications at once)
app.post('/notify/batch', async (req, res) => {
  const { notifications } = req.body;

  if (!Array.isArray(notifications) || notifications.length === 0) {
    return res.status(400).json({
      error: 'notifications array is required and must not be empty'
    });
  }

  const results = [];
  
  for (const notification of notifications) {
    const { type, message, icon } = notification;
    if (type && message) {
      const result = await sendTelegramNotification(type, message, icon);
      results.push({ type, success: result.success });
    }
  }

  res.json({
    success: true,
    results: results
  });
});

// Test notification endpoint
app.get('/test', async (req, res) => {
  const result = await sendTelegramNotification(
    'test',
    'This is a test notification from your Telegram Notifier service! 🎉',
    '🧪'
  );

  if (result.success) {
    res.json({
      success: true,
      message: 'Test notification sent! Check your Telegram.'
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all interfaces (IPv4 and IPv6)

app.listen(PORT, HOST, () => {
  console.log(`🚀 Telegram Notifier Service running on ${HOST}:${PORT}`);
  console.log(`📱 Bot Status: ${botReady ? 'Ready' : 'Not configured'}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /test - Send test notification`);
  console.log(`   POST /notify - Send single notification`);
  console.log(`   POST /notify/batch - Send multiple notifications`);
  
  if (!botReady) {
    console.log(`\n⚠️  WARNING: Bot not configured!`);
    console.log(`   Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables`);
  }
});

// Made with Bob
