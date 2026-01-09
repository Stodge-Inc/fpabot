// FPA Bot - Financial Planning & Analysis Slack Bot
// Powered by Claude AI with access to Rillet (ERP) and Google Sheets (Budget)

const { App } = require('@slack/bolt');
const http = require('http');
const financialAnalyst = require('./financial-analyst');

// Initialize Slack app with Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  // Disable built-in event acknowledgment for custom handling
});

// HTTP server for Heroku health checks
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bot: 'fpabot' }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Allowed channels (comma-separated channel IDs in env var)
const ALLOWED_CHANNEL_IDS = process.env.FPA_CHANNEL_IDS
  ? process.env.FPA_CHANNEL_IDS.split(',').map(id => id.trim())
  : [];

// ============================================================================
// @MENTION HANDLER - Main entry point for questions
// ============================================================================
app.event('app_mention', async ({ event, client, logger }) => {
  // Security: Only respond in designated channels (if configured)
  if (ALLOWED_CHANNEL_IDS.length > 0 && !ALLOWED_CHANNEL_IDS.includes(event.channel)) {
    logger.info(`[FPA Bot] Ignoring mention in non-allowed channel: ${event.channel}`);
    return;
  }

  // Extract the question (remove the @mention)
  const question = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

  if (!question) {
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: "Hi! Ask me a question about budget, actuals, or financial metrics. For example:\n- What's our Q1 revenue budget?\n- What was our cash balance on 12/31?\n- How does actual headcount compare to budget?"
    });
    return;
  }

  logger.info(`[FPA Bot] Question from ${event.user}: ${question.substring(0, 100)}...`);

  // Post thinking indicator
  const thinkingMsg = await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.ts,
    text: ':hourglass_flowing_sand: Analyzing...'
  });

  try {
    // Process with financial analyst
    const response = await financialAnalyst.analyze(question, {
      userId: event.user,
      channelId: event.channel,
      threadTs: event.ts
    });

    // Update thinking message with response
    await client.chat.update({
      channel: event.channel,
      ts: thinkingMsg.ts,
      text: response.text,
      blocks: response.blocks
    });

    logger.info(`[FPA Bot] Successfully responded to ${event.user}`);

  } catch (error) {
    logger.error('[FPA Bot] Error processing question:', error);

    await client.chat.update({
      channel: event.channel,
      ts: thinkingMsg.ts,
      text: ':warning: Sorry, I encountered an error analyzing your question. Please try again.',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':warning: Sorry, I encountered an error analyzing your question. Please try again.'
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Error: ${error.message}`
            }
          ]
        }
      ]
    });
  }
});

// ============================================================================
// THREAD REPLY HANDLER - Follow-up questions in threads
// ============================================================================
app.message(async ({ message, client, logger }) => {
  // Only process messages in threads
  if (!message.thread_ts) return;

  // Ignore bot messages to prevent loops
  if (message.bot_id || message.subtype === 'bot_message') return;

  // Security: Only respond in designated channels (if configured)
  if (ALLOWED_CHANNEL_IDS.length > 0 && !ALLOWED_CHANNEL_IDS.includes(message.channel)) {
    return;
  }

  try {
    // Get the parent message to check if this is an FPA Bot thread
    const result = await client.conversations.replies({
      channel: message.channel,
      ts: message.thread_ts,
      limit: 1
    });

    const parentMessage = result.messages?.[0];
    if (!parentMessage) return;

    // Check if the thread was started by an @mention to us
    // Look for our bot ID in the parent message
    const botInfo = await client.auth.test();
    const botUserId = botInfo.user_id;

    const wasAtMentioned = parentMessage.text?.includes(`<@${botUserId}>`);
    if (!wasAtMentioned) {
      // Also check if we replied in this thread (bot_id match)
      const threadReplies = await client.conversations.replies({
        channel: message.channel,
        ts: message.thread_ts,
        limit: 10
      });

      const botReplied = threadReplies.messages?.some(m => m.bot_id);
      if (!botReplied) return;
    }

    const question = message.text?.trim();
    if (!question) return;

    logger.info(`[FPA Bot] Thread reply from ${message.user}: ${question.substring(0, 100)}...`);

    // Post thinking indicator
    const thinkingMsg = await client.chat.postMessage({
      channel: message.channel,
      thread_ts: message.thread_ts,
      text: ':hourglass_flowing_sand: Analyzing...'
    });

    // Process with financial analyst
    const response = await financialAnalyst.analyze(question, {
      userId: message.user,
      channelId: message.channel,
      threadTs: message.thread_ts
    });

    // Update thinking message with response
    await client.chat.update({
      channel: message.channel,
      ts: thinkingMsg.ts,
      text: response.text,
      blocks: response.blocks
    });

    logger.info(`[FPA Bot] Thread reply sent to ${message.user}`);

  } catch (error) {
    logger.error('[FPA Bot] Error handling thread reply:', error);

    await client.chat.postMessage({
      channel: message.channel,
      thread_ts: message.thread_ts,
      text: ':warning: Sorry, I encountered an error processing your follow-up question. Please try again.'
    });
  }
});

// ============================================================================
// START THE APP
// ============================================================================
(async () => {
  const port = process.env.PORT || 3000;

  // Start HTTP server for Heroku health checks
  server.listen(port, () => {
    console.log(`HTTP health check server listening on port ${port}`);
  });

  // Start Slack app (Socket Mode connects via WebSocket)
  await app.start();
  console.log('FPA Bot is running!');
  console.log(`Allowed channels: ${ALLOWED_CHANNEL_IDS.length > 0 ? ALLOWED_CHANNEL_IDS.join(', ') : 'ALL'}`);
})();
