// Conversation Store - Postgres-backed persistence for thread conversations
// Falls back to in-memory if DATABASE_URL is not configured

const { Pool } = require('pg');

class ConversationStore {
  constructor() {
    this.pool = null;
    this.memoryStore = new Map(); // Fallback
    this.initialized = false;
    this.TTL_HOURS = 24; // Keep conversations for 24 hours
  }

  async initialize() {
    if (this.initialized) return;

    if (!process.env.DATABASE_URL) {
      console.log('[ConversationStore] No DATABASE_URL - using in-memory storage');
      this.initialized = true;
      return;
    }

    try {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30000
      });

      // Create table if not exists
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS fpa_conversations (
          thread_ts VARCHAR(50) PRIMARY KEY,
          messages JSONB NOT NULL,
          last_activity TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create index on last_activity for cleanup
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_fpa_conversations_last_activity
        ON fpa_conversations(last_activity)
      `);

      console.log('[ConversationStore] Postgres initialized successfully');
      this.initialized = true;

      // Start cleanup job
      this.startCleanupJob();
    } catch (error) {
      console.error('[ConversationStore] Postgres init failed, falling back to memory:', error.message);
      this.pool = null;
      this.initialized = true;
    }
  }

  async get(threadTs) {
    await this.initialize();

    if (!threadTs) return [];

    // Try Postgres first
    if (this.pool) {
      try {
        const result = await this.pool.query(
          'SELECT messages FROM fpa_conversations WHERE thread_ts = $1',
          [threadTs]
        );
        if (result.rows.length > 0) {
          return result.rows[0].messages || [];
        }
        return [];
      } catch (error) {
        console.error('[ConversationStore] Postgres get error:', error.message);
      }
    }

    // Fallback to memory
    const conv = this.memoryStore.get(threadTs);
    return conv ? conv.messages : [];
  }

  async save(threadTs, messages) {
    await this.initialize();

    if (!threadTs) return;

    // Trim to last 20 messages (~10 exchanges)
    const trimmedMessages = messages.slice(-20);

    // Try Postgres first
    if (this.pool) {
      try {
        await this.pool.query(`
          INSERT INTO fpa_conversations (thread_ts, messages, last_activity)
          VALUES ($1, $2, NOW())
          ON CONFLICT (thread_ts)
          DO UPDATE SET messages = $2, last_activity = NOW()
        `, [threadTs, JSON.stringify(trimmedMessages)]);
        return;
      } catch (error) {
        console.error('[ConversationStore] Postgres save error:', error.message);
      }
    }

    // Fallback to memory
    this.memoryStore.set(threadTs, {
      messages: trimmedMessages,
      lastActivity: Date.now()
    });
  }

  async delete(threadTs) {
    await this.initialize();

    if (!threadTs) return;

    if (this.pool) {
      try {
        await this.pool.query(
          'DELETE FROM fpa_conversations WHERE thread_ts = $1',
          [threadTs]
        );
        return;
      } catch (error) {
        console.error('[ConversationStore] Postgres delete error:', error.message);
      }
    }

    this.memoryStore.delete(threadTs);
  }

  async cleanup() {
    // Clean up old conversations
    if (this.pool) {
      try {
        const result = await this.pool.query(`
          DELETE FROM fpa_conversations
          WHERE last_activity < NOW() - INTERVAL '${this.TTL_HOURS} hours'
        `);
        if (result.rowCount > 0) {
          console.log(`[ConversationStore] Cleaned up ${result.rowCount} old conversations`);
        }
      } catch (error) {
        console.error('[ConversationStore] Cleanup error:', error.message);
      }
    }

    // Memory cleanup
    const now = Date.now();
    const ttlMs = this.TTL_HOURS * 60 * 60 * 1000;
    for (const [threadTs, conv] of this.memoryStore.entries()) {
      if (now - conv.lastActivity > ttlMs) {
        this.memoryStore.delete(threadTs);
      }
    }
  }

  startCleanupJob() {
    // Run cleanup every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }
}

module.exports = new ConversationStore();
