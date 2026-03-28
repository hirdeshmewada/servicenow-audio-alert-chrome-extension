/**
 * Cache Manager Module
 * Provides intelligent response caching to reduce API calls
 * Improves performance and reduces ServiceNow server load
 */

import { Logger } from './logger.js';

export class CacheManager {
    
    /**
     * Constructor - Initialize cache with configuration
     * @param {number} ttlMinutes - Cache time-to-live in minutes
     */
    constructor(ttlMinutes = 5) {
        this.cache = new Map();
        this.cacheTimeout = ttlMinutes * 60 * 1000; // Convert to milliseconds
        this.maxCacheSize = 100; // Maximum number of cached items
        this.hitCount = 0;
        this.missCount = 0;
    }
    
    /**
     * Gets cached data if available and not expired
     * @param {string} key - Cache key
     * @returns {any|null} - Cached data or null if not found/expired
     */
    get(key) {
        const cached = this.cache.get(key);
        
        if (!cached) {
            this.missCount++;
            Logger.debug(`Cache miss: ${key}`);
            return null;
        }
        
        // Check if cache is still valid
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.cache.delete(key);
            this.missCount++;
            Logger.debug(`Cache expired: ${key}`);
            return null;
        }
        
        this.hitCount++;
        Logger.debug(`Cache hit: ${key} (${cached.age}ms old)`);
        return cached.data;
    }
    
    /**
     * Sets data in cache with timestamp
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     * @param {number} customTtl - Optional custom TTL in milliseconds
     */
    set(key, data, customTtl = null) {
        // Check cache size limit
        if (this.cache.size >= this.maxCacheSize) {
            this.evictOldest();
        }
        
        const cacheEntry = {
            data: data,
            timestamp: Date.now(),
            ttl: customTtl || this.cacheTimeout,
            age: 0
        };
        
        this.cache.set(key, cacheEntry);
        Logger.debug(`Cache set: ${key}`);
    }
    
    /**
     * Removes specific item from cache
     * @param {string} key - Cache key to remove
     * @returns {boolean} - True if item was removed
     */
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            Logger.debug(`Cache deleted: ${key}`);
        }
        return deleted;
    }
    
    /**
     * Clears all cached items
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.hitCount = 0;
        this.missCount = 0;
        Logger.info(`Cache cleared: ${size} items removed`);
    }
    
    /**
     * Evicts oldest items to maintain cache size
     */
    evictOldest() {
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, value] of this.cache.entries()) {
            if (value.timestamp < oldestTime) {
                oldestTime = value.timestamp;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            Logger.debug(`Cache evicted oldest: ${oldestKey}`);
        }
    }
    
    /**
     * Gets cache statistics
     * @returns {object} - Cache performance metrics
     */
    getStats() {
        const total = this.hitCount + this.missCount;
        const hitRate = total > 0 ? (this.hitCount / total * 100).toFixed(2) : 0;
        
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize,
            hitCount: this.hitCount,
            missCount: this.missCount,
            hitRate: `${hitRate}%`,
            ttl: this.cacheTimeout / 1000 / 60 // Convert back to minutes
        };
    }
    
    /**
     * Logs cache statistics
     */
    logStats() {
        const stats = this.getStats();
        Logger.info(`Cache Stats - Size: ${stats.size}/${stats.maxSize}, Hit Rate: ${stats.hitRate}, TTL: ${stats.ttl}min`);
    }
    
    /**
     * Sets cache configuration
     * @param {object} config - Cache configuration
     */
    configure(config) {
        if (config.ttlMinutes) {
            this.cacheTimeout = config.ttlMinutes * 60 * 1000;
        }
        
        if (config.maxSize) {
            this.maxCacheSize = config.maxSize;
            
            // Evict excess items if new size is smaller
            while (this.cache.size > this.maxCacheSize) {
                this.evictOldest();
            }
        }
        
        Logger.info(`Cache configured - TTL: ${config.ttlMinutes}min, Max Size: ${config.maxSize}`);
    }
    
    /**
     * Gets items that are about to expire
     * @param {number} withinMinutes - Time window in minutes
     * @returns {Array>} - Array of keys about to expire
     */
    getExpiringItems(withinMinutes = 1) {
        const expiring = [];
        const threshold = Date.now() + (withinMinutes * 60 * 1000);
        
        for (const [key, value] of this.cache.entries()) {
            if (value.timestamp + value.ttl <= threshold) {
                expiring.push({
                    key: key,
                    expiresAt: new Date(value.timestamp + value.ttl),
                    remainingMinutes: Math.round((value.timestamp + value.ttl - Date.now()) / 60000)
                });
            }
        }
        
        return expiring;
    }
    
    /**
     * Refreshes expiring cache items
     * @param {Function} refreshFunction - Function to refresh data
     * @returns {Promise<number>} - Number of items refreshed
     */
    async refreshExpiringItems(refreshFunction) {
        const expiring = this.getExpiringItems();
        let refreshedCount = 0;
        
        for (const item of expiring) {
            try {
                const newData = await refreshFunction(item.key);
                this.set(item.key, newData);
                refreshedCount++;
                Logger.debug(`Cache refreshed: ${item.key}`);
            } catch (error) {
                Logger.error(`Failed to refresh cache item ${item.key}: ${error.message}`);
            }
        }
        
        return refreshedCount;
    }
    
    /**
     * Creates cache key from URL and parameters
     * @param {string} url - API URL
     * @param {object} params - Request parameters
     * @returns {string} - Unique cache key
     */
    static createCacheKey(url, params = {}) {
        const paramString = Object.keys(params)
            .sort()
            .map(key => `${key}=${params[key]}`)
            .join('&');
        
        return `api_${url}_${paramString}`;
    }
    
    /**
     * Validates cache key format
     * @param {string} key - Cache key to validate
     * @returns {boolean} - True if key is valid
     */
    static isValidKey(key) {
        return typeof key === 'string' && key.length > 0 && key.length < 200;
    }
}
