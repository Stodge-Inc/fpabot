// Chart Storage - Stores rendered chart images in Postgres
// Charts are served via HTTP endpoint and cleaned up after 24 hours

const { Pool } = require('pg');

class ChartStorage {
  constructor() {
    this.pool = null;
    this.initialized = false;
    this.TTL_HOURS = 24; // Keep charts for 24 hours
  }

  async initialize() {
    if (this.initialized) return;

    if (!process.env.DATABASE_URL) {
      console.log('[ChartStorage] No DATABASE_URL - chart storage disabled');
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
        CREATE TABLE IF NOT EXISTS fpa_charts (
          id VARCHAR(36) PRIMARY KEY,
          image_data BYTEA NOT NULL,
          content_type VARCHAR(50) DEFAULT 'image/png',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create index on created_at for cleanup
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_fpa_charts_created_at
        ON fpa_charts(created_at)
      `);

      console.log('[ChartStorage] Postgres initialized successfully');
      this.initialized = true;

      // Start cleanup job
      this.startCleanupJob();
    } catch (error) {
      console.error('[ChartStorage] Postgres init failed:', error.message);
      this.pool = null;
      this.initialized = true;
    }
  }

  /**
   * Store a chart image and return its ID
   * @param {string} id - Unique chart ID
   * @param {Buffer} imageData - PNG image buffer
   * @returns {Promise<string>} - Chart ID
   */
  async store(id, imageData) {
    await this.initialize();

    if (!this.pool) {
      throw new Error('Chart storage not available');
    }

    try {
      await this.pool.query(
        'INSERT INTO fpa_charts (id, image_data) VALUES ($1, $2)',
        [id, imageData]
      );
      console.log(`[ChartStorage] Stored chart: ${id}`);
      return id;
    } catch (error) {
      console.error('[ChartStorage] Store error:', error.message);
      throw error;
    }
  }

  /**
   * Retrieve a chart image by ID
   * @param {string} id - Chart ID
   * @returns {Promise<Buffer|null>} - Image buffer or null if not found
   */
  async get(id) {
    await this.initialize();

    if (!this.pool) {
      return null;
    }

    try {
      const result = await this.pool.query(
        'SELECT image_data, content_type FROM fpa_charts WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        data: result.rows[0].image_data,
        contentType: result.rows[0].content_type
      };
    } catch (error) {
      console.error('[ChartStorage] Get error:', error.message);
      return null;
    }
  }

  /**
   * Delete a chart by ID
   * @param {string} id - Chart ID
   */
  async delete(id) {
    await this.initialize();

    if (!this.pool) return;

    try {
      await this.pool.query('DELETE FROM fpa_charts WHERE id = $1', [id]);
    } catch (error) {
      console.error('[ChartStorage] Delete error:', error.message);
    }
  }

  /**
   * Clean up old charts
   */
  async cleanup() {
    if (!this.pool) return;

    try {
      const result = await this.pool.query(`
        DELETE FROM fpa_charts
        WHERE created_at < NOW() - INTERVAL '${this.TTL_HOURS} hours'
      `);

      if (result.rowCount > 0) {
        console.log(`[ChartStorage] Cleaned up ${result.rowCount} old charts`);
      }
    } catch (error) {
      console.error('[ChartStorage] Cleanup error:', error.message);
    }
  }

  /**
   * Start periodic cleanup job
   */
  startCleanupJob() {
    // Run cleanup every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Check if storage is available
   */
  isAvailable() {
    return this.pool !== null;
  }
}

module.exports = new ChartStorage();
