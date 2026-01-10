// Claude API Client - Wrapper for Anthropic SDK

const Anthropic = require('@anthropic-ai/sdk');

class ClaudeClient {
  constructor() {
    this.client = null;
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'; // Sonnet for better reasoning
  }

  initialize() {
    if (this.client) return;

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    console.log(`[Claude] Initializing with model: ${this.model}`);

    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  /**
   * Create a message with Claude, supporting tool use
   * @param {object} options
   * @param {string} options.system - System prompt
   * @param {Array} options.messages - Conversation messages
   * @param {Array} options.tools - Tool definitions
   * @param {number} options.max_tokens - Maximum tokens in response
   * @returns {Promise<object>} - Claude API response
   */
  async createMessage({ system, messages, tools, max_tokens = 4096 }) {
    this.initialize();

    // Use prompt caching for the system prompt (90% cheaper, doesn't count against rate limits)
    const systemWithCache = [
      {
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral' }
      }
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens,
      system: systemWithCache,
      messages,
      tools
    });

    // Log cache performance
    if (response.usage) {
      const cacheRead = response.usage.cache_read_input_tokens || 0;
      const cacheCreation = response.usage.cache_creation_input_tokens || 0;
      if (cacheRead > 0 || cacheCreation > 0) {
        console.log(`[Cache] Read: ${cacheRead} tokens, Created: ${cacheCreation} tokens`);
      }
    }

    return response;
  }

  /**
   * Create a message with retry logic for rate limits
   * @param {object} options - Same as createMessage
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<object>} - Claude API response
   */
  async createMessageWithRetry(options, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.createMessage(options);
      } catch (error) {
        // Check if it's a rate limit error (429)
        if (error.status === 429 && attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Rate limited, waiting ${waitTime}ms before retry...`);
          await this.sleep(waitTime);
          continue;
        }

        // Check for overloaded error
        if (error.status === 529 && attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 2000;
          console.log(`API overloaded, waiting ${waitTime}ms before retry...`);
          await this.sleep(waitTime);
          continue;
        }

        throw error;
      }
    }

    throw new Error('Max retries exceeded for Claude API');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ClaudeClient;
