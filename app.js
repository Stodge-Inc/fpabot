// FPA Bot - Financial Planning & Analysis Slack Bot
// Powered by Claude AI with access to Rillet (ERP) and Google Sheets (Budget)

const { App } = require('@slack/bolt');
const http = require('http');
const financialAnalyst = require('./financial-analyst');
const chartStorage = require('./financial-analyst/tools/chart-storage');
const metricsStore = require('./financial-analyst/metrics-store');
const conversationStore = require('./financial-analyst/conversation-store');

// Initialize Slack app with Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  // Disable built-in event acknowledgment for custom handling
});

// HTTP server for health checks and chart serving
const server = http.createServer(async (req, res) => {
  // Health check endpoints
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bot: 'fpabot' }));
    return;
  }

  // Chart image endpoint: /chart/{id}.png
  const chartMatch = req.url.match(/^\/chart\/([a-f0-9-]+)\.png$/i);
  if (chartMatch) {
    const chartId = chartMatch[1];
    try {
      const chart = await chartStorage.get(chartId);
      if (chart) {
        res.writeHead(200, {
          'Content-Type': chart.contentType || 'image/png',
          'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
        });
        res.end(chart.data);
        return;
      }
    } catch (error) {
      console.error('[Chart] Error serving chart:', error.message);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Chart not found');
    return;
  }

  // Metrics refresh endpoint: POST /refresh-metrics
  if (req.url === '/refresh-metrics' && req.method === 'POST') {
    console.log('[Metrics] Manual refresh triggered');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'started', message: 'Metrics refresh started in background' }));
    // Run refresh in background (don't await)
    metricsStore.refreshAllMetrics().catch(err => {
      console.error('[Metrics] Refresh failed:', err.message);
    });
    return;
  }

  // Metrics status endpoint: GET /metrics-status
  if (req.url === '/metrics-status') {
    try {
      const lastRefresh = await metricsStore.getLastRefreshTime();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ last_refresh: lastRefresh }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 404 for everything else
  res.writeHead(404);
  res.end('Not found');
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
      thread_ts: event.thread_ts || event.ts,
      text: "Hi! Ask me a question about budget, actuals, or financial metrics. For example:\n- What's our Q1 revenue budget?\n- What was our cash balance on 12/31?\n- How does actual headcount compare to budget?"
    });
    return;
  }

  logger.info(`[FPA Bot] Question from ${event.user}: ${question.substring(0, 100)}...`);

  // Use existing thread if we're in one, otherwise start new thread from this message
  const threadTs = event.thread_ts || event.ts;

  // Post thinking indicator
  const thinkingMsg = await client.chat.postMessage({
    channel: event.channel,
    thread_ts: threadTs,
    text: ':hourglass_flowing_sand: Analyzing...'
  });

  try {
    // Process with financial analyst
    const response = await financialAnalyst.analyze(question, {
      userId: event.user,
      channelId: event.channel,
      threadTs: threadTs
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
// DM AND THREAD REPLY HANDLER - Direct messages and follow-up questions
// ============================================================================
app.message(async ({ message, client, logger }) => {
  // Ignore bot messages to prevent loops
  if (message.bot_id || message.subtype === 'bot_message') return;

  // Check if this is a DM (channel ID starts with 'D')
  const isDM = message.channel?.startsWith('D');

  // For DMs, respond to any message directly
  if (isDM) {
    const question = message.text?.trim();
    if (!question) return;

    logger.info(`[FPA Bot] DM from ${message.user}: ${question.substring(0, 100)}...`);

    // Post thinking indicator
    const thinkingMsg = await client.chat.postMessage({
      channel: message.channel,
      text: ':hourglass_flowing_sand: Analyzing...'
    });

    try {
      // Process with financial analyst
      const response = await financialAnalyst.analyze(question, {
        userId: message.user,
        channelId: message.channel,
        threadTs: message.ts
      });

      // Update thinking message with response
      await client.chat.update({
        channel: message.channel,
        ts: thinkingMsg.ts,
        text: response.text,
        blocks: response.blocks
      });

      logger.info(`[FPA Bot] DM response sent to ${message.user}`);
    } catch (error) {
      logger.error('[FPA Bot] Error handling DM:', error);

      await client.chat.update({
        channel: message.channel,
        ts: thinkingMsg.ts,
        text: ':warning: Sorry, I encountered an error analyzing your question. Please try again.'
      });
    }
    return;
  }

  // For channels: only process messages in threads
  if (!message.thread_ts) return;

  // Security: Only respond in designated channels (if configured)
  if (ALLOWED_CHANNEL_IDS.length > 0 && !ALLOWED_CHANNEL_IDS.includes(message.channel)) {
    return;
  }

  try {
    // Check if this message @mentions us
    const botInfo = await client.auth.test();
    const botUserId = botInfo.user_id;
    const messageAtMentionsUs = message.text?.includes(`<@${botUserId}>`);

    // If @mentioned, let app_mention handler deal with it (avoid double-processing)
    if (messageAtMentionsUs) return;

    // Check if we have an existing conversation in this thread
    const existingConversation = await conversationStore.get(message.thread_ts);
    const hasExistingConversation = existingConversation && existingConversation.length > 0;

    // Only respond to follow-ups in threads where we already have a conversation
    // This prevents "chasing" into threads where we weren't invited
    if (!hasExistingConversation) return;

    // Extract the question (remove the @mention)
    const question = message.text.replace(/<@[A-Z0-9]+>/g, '').trim();
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

  // Initialize metrics table
  try {
    await metricsStore.initializeTable();
    console.log('Metrics store initialized');
  } catch (err) {
    console.error('Failed to initialize metrics store:', err.message);
  }

  // Start Slack app (Socket Mode connects via WebSocket)
  await app.start();
  console.log('FPA Bot is running!');
  console.log(`Allowed channels: ${ALLOWED_CHANNEL_IDS.length > 0 ? ALLOWED_CHANNEL_IDS.join(', ') : 'ALL'}`);
})();
