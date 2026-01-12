// Claude API Client - Wrapper for Anthropic SDK

const Anthropic = require('@anthropic-ai/sdk');

// Models
const OPUS_MODEL = 'claude-opus-4-5-20251101';
const SONNET_MODEL = 'claude-sonnet-4-20250514';

class ClaudeClient {
  constructor() {
    this.client = null;
    this.model = process.env.CLAUDE_MODEL || SONNET_MODEL;
    this.fallbackModel = SONNET_MODEL;
    this.usingFallback = false; // Sticky fallback - once triggered, stays on for this session
    this.fallbackUntil = null; // Time when we can try primary model again
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
   * @param {string} options.model - Optional model override
   * @returns {Promise<object>} - Claude API response
   */
  async createMessage({ system, messages, tools, max_tokens = 4096, model = null }) {
    this.initialize();

    const useModel = model || this.model;

    // Use prompt caching for the system prompt (90% cheaper, doesn't count against rate limits)
    const systemWithCache = [
      {
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral' }
      }
    ];

    const response = await this.client.messages.create({
      model: useModel,
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
   * Get the current model to use (respects sticky fallback)
   */
  getCurrentModel() {
    // Check if fallback period has expired (5 minutes)
    if (this.usingFallback && this.fallbackUntil && Date.now() > this.fallbackUntil) {
      console.log(`[Claude] Fallback period expired, will try primary model (${this.model}) again`);
      this.usingFallback = false;
      this.fallbackUntil = null;
    }

    return this.usingFallback ? this.fallbackModel : this.model;
  }

  /**
   * Create a message with retry logic and fallback model
   * @param {object} options - Same as createMessage
   * @param {number} maxRetries - Maximum retry attempts per model
   * @returns {Promise<object>} - Claude API response
   */
  async createMessageWithRetry(options, maxRetries = 5) {
    let lastError = null;
    const currentModel = this.getCurrentModel();

    // If already using fallback, go straight to fallback model with fewer retries
    if (this.usingFallback) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          return await this.createMessage({ ...options, model: this.fallbackModel });
        } catch (error) {
          lastError = error;

          if ((error.status === 429 || error.status === 529) && attempt < maxRetries - 1) {
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`[Claude] Fallback model error, waiting ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})...`);
            await this.sleep(waitTime);
            continue;
          }

          if (error.status !== 429 && error.status !== 529) {
            throw error;
          }
        }
      }
      throw lastError || new Error('Max retries exceeded for fallback model');
    }

    // Try primary model first (only 2 attempts before falling back quickly)
    const primaryRetries = 2;
    for (let attempt = 0; attempt < primaryRetries; attempt++) {
      try {
        return await this.createMessage(options);
      } catch (error) {
        lastError = error;

        // Check if it's a rate limit error (429)
        if (error.status === 429 && attempt < primaryRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`[Claude] Rate limited, waiting ${waitTime}ms before retry (attempt ${attempt + 1}/${primaryRetries})...`);
          await this.sleep(waitTime);
          continue;
        }

        // Check for overloaded error (529) - fall back faster
        if (error.status === 529) {
          console.log(`[Claude] Primary model (${this.model}) overloaded. Falling back to ${this.fallbackModel}...`);
          break; // Exit loop and go to fallback
        }

        // For other errors, don't retry
        if (error.status !== 429 && error.status !== 529) {
          throw error;
        }
      }
    }

    // Fall back to Sonnet
    if (lastError?.status === 529 && this.model !== this.fallbackModel) {
      // Set sticky fallback for 5 minutes
      this.usingFallback = true;
      this.fallbackUntil = Date.now() + 5 * 60 * 1000;
      console.log(`[Claude] Sticky fallback enabled for 5 minutes`);

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const response = await this.createMessage({ ...options, model: this.fallbackModel });
          console.log(`[Claude] Fallback to ${this.fallbackModel} succeeded`);
          return response;
        } catch (error) {
          lastError = error;

          if (error.status === 529 && attempt < maxRetries - 1) {
            const waitTime = Math.pow(2, attempt) * 2000;
            console.log(`[Claude] Fallback model overloaded, waiting ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})...`);
            await this.sleep(waitTime);
            continue;
          }

          if (error.status !== 429 && error.status !== 529) {
            throw error;
          }
        }
      }
    }

    // All retries exhausted
    throw new Error(`Max retries exceeded for Claude API`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ClaudeClient;
