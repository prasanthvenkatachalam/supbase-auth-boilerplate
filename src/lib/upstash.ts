/**
 * Upstash Redis Client Configuration
 * 
 * This module sets up the Redis client for rate limiting and caching.
 * We're using Upstash Redis because:
 * 1. Serverless-first: Perfect for Next.js Edge/API routes
 * 2. HTTP-based: No persistent connections needed
 * 3. Global replication: Low latency worldwide
 * 4. Pay-per-request: Cost-effective for variable traffic
 */

import { Redis } from "@upstash/redis";

// Validate environment variables at startup
if (!process.env.UPSTASH_REDIS_REST_URL) {
  throw new Error("UPSTASH_REDIS_REST_URL is not defined in environment variables");
}

if (!process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error("UPSTASH_REDIS_REST_TOKEN is not defined in environment variables");
}

/**
 * Singleton Redis client instance
 * 
 * Using the REST API approach instead of Redis protocol because:
 * - Works seamlessly in serverless environments (Vercel, Cloudflare Workers)
 * - No connection pooling needed
 * - Automatic retries and timeouts
 * - TLS encryption by default
 */
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Test Redis connection
 * Useful for health checks and debugging
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch (error) {
    console.error("Redis connection failed:", error);
    return false;
  }
}
