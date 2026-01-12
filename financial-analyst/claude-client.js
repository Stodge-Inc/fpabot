// Claude API Client - Wrapper for Anthropic SDK with OpenAI fallback

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// Models
const OPUS_MODEL = 'claude-opus-4-5-20251101';
const OPENAI_MODEL = 'gpt-4o'; // Fast and capable

class ClaudeClient {
  constructor() {
    this.anthropic = null;
    this.openai = null;
    this.model = process.env.CLAUDE_MODEL || OPUS_MODEL;
    this.usingFallback = false;
    this.fallbackUntil = null;
  }

  initialize() {
    if (!this.anthropic && process.env.ANTHROPIC_API_KEY) {
      console.log(`[Claude] Initializing Anthropic with model: ${this.model}`);
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }

    if (!this.openai && process.env.OPENAI_API_KEY) {
      console.log(`[Claude] Initializing OpenAI fallback with model: ${OPENAI_MODEL}`);
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }

    if (!this.anthropic) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
  }

  /**
   * Convert Anthropic tools format to OpenAI format
   */
  convertToolsToOpenAI(tools) {
    if (!tools) return undefined;
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));
  }

  /**
   * Convert Anthropic messages format to OpenAI format
   */
  convertMessagesToOpenAI(messages, system) {
    const openaiMessages = [];

    // Add system message
    if (system) {
      const systemText = typeof system === 'string' ? system : system[0]?.text || '';
      openaiMessages.push({ role: 'system', content: systemText });
    }

    // Convert each message
    for (const msg of messages) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          openaiMessages.push({ role: 'user', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          // Handle array content (text blocks, tool results)
          const textParts = [];
          const toolResults = [];

          for (const block of msg.content) {
            if (block.type === 'text') {
              textParts.push(block.text);
            } else if (block.type === 'tool_result') {
              toolResults.push({
                role: 'tool',
                tool_call_id: block.tool_use_id,
                content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
              });
            }
          }

          if (textParts.length > 0) {
            openaiMessages.push({ role: 'user', content: textParts.join('\n') });
          }
          openaiMessages.push(...toolResults);
        }
      } else if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          openaiMessages.push({ role: 'assistant', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          // Handle tool use blocks
          const textParts = [];
          const toolCalls = [];

          for (const block of msg.content) {
            if (block.type === 'text') {
              textParts.push(block.text);
            } else if (block.type === 'tool_use') {
              toolCalls.push({
                id: block.id,
                type: 'function',
                function: {
                  name: block.name,
                  arguments: JSON.stringify(block.input)
                }
              });
            }
          }

          const assistantMsg = {
            role: 'assistant',
            content: textParts.join('\n') || null
          };
          if (toolCalls.length > 0) {
            assistantMsg.tool_calls = toolCalls;
          }
          openaiMessages.push(assistantMsg);
        }
      }
    }

    return openaiMessages;
  }

  /**
   * Convert OpenAI response to Anthropic format
   */
  convertOpenAIResponse(response) {
    const choice = response.choices[0];
    const content = [];

    if (choice.message.content) {
      content.push({ type: 'text', text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments)
        });
      }
    }

    return {
      content,
      stop_reason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0
      },
      _provider: 'openai'
    };
  }

  /**
   * Create a message with Claude
   */
  async createMessage({ system, messages, tools, max_tokens = 4096, model = null }) {
    this.initialize();

    const useModel = model || this.model;

    // Use prompt caching for the system prompt
    const systemWithCache = [
      {
        type: 'text',
        text: typeof system === 'string' ? system : system,
        cache_control: { type: 'ephemeral' }
      }
    ];

    const response = await this.anthropic.messages.create({
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
   * Create a message with OpenAI (fallback)
   */
  async createMessageOpenAI({ system, messages, tools, max_tokens = 4096 }) {
    if (!this.openai) {
      throw new Error('OpenAI not configured - OPENAI_API_KEY not set');
    }

    const openaiMessages = this.convertMessagesToOpenAI(messages, system);
    const openaiTools = this.convertToolsToOpenAI(tools);

    const response = await this.openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens,
      messages: openaiMessages,
      tools: openaiTools
    });

    return this.convertOpenAIResponse(response);
  }

  /**
   * Create a message with retry logic and OpenAI fallback
   */
  async createMessageWithRetry(options, maxRetries = 5) {
    let lastError = null;

    // Check if fallback period has expired (5 minutes)
    if (this.usingFallback && this.fallbackUntil && Date.now() > this.fallbackUntil) {
      console.log(`[Claude] Fallback period expired, will try Anthropic again`);
      this.usingFallback = false;
      this.fallbackUntil = null;
    }

    // If already using fallback, go straight to OpenAI
    if (this.usingFallback) {
      console.log(`[Claude] Using OpenAI fallback (sticky)`);
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          return await this.createMessageOpenAI(options);
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries - 1) {
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`[Claude] OpenAI error, waiting ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})...`);
            await this.sleep(waitTime);
            continue;
          }
        }
      }
      throw lastError || new Error('Max retries exceeded for OpenAI');
    }

    // Try Anthropic first (only 2 attempts before falling back quickly)
    const primaryRetries = 2;
    for (let attempt = 0; attempt < primaryRetries; attempt++) {
      try {
        return await this.createMessage(options);
      } catch (error) {
        lastError = error;

        // Rate limit - retry with backoff
        if (error.status === 429 && attempt < primaryRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`[Claude] Rate limited, waiting ${waitTime}ms (attempt ${attempt + 1}/${primaryRetries})...`);
          await this.sleep(waitTime);
          continue;
        }

        // Overloaded - fall back to OpenAI
        if (error.status === 529) {
          console.log(`[Claude] Anthropic overloaded (${this.model}). Falling back to OpenAI (${OPENAI_MODEL})...`);
          break;
        }

        // Other errors - don't retry
        if (error.status !== 429 && error.status !== 529) {
          throw error;
        }
      }
    }

    // Fall back to OpenAI
    if (lastError?.status === 529 && this.openai) {
      this.usingFallback = true;
      this.fallbackUntil = Date.now() + 5 * 60 * 1000;
      console.log(`[Claude] Sticky fallback to OpenAI enabled for 5 minutes`);

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const response = await this.createMessageOpenAI(options);
          console.log(`[Claude] OpenAI fallback succeeded`);
          return response;
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries - 1) {
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`[Claude] OpenAI error, waiting ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})...`);
            await this.sleep(waitTime);
            continue;
          }
        }
      }
    }

    throw lastError || new Error('Max retries exceeded for Claude API');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ClaudeClient;
