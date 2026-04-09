/**
 * Redis connection management
 */

import Redis from "ioredis";

export async function createRedisClient(redisUrl: string) {
  const client = new Redis(redisUrl, {
    retryStrategy: (times) => Math.min(times * 50, 500),
    maxRetriesPerRequest: null,
  });

  client.on("error", (err: any) => console.log("Redis Client Error", err));

  console.log("Redis connected");

  return client;
}

export async function closeRedisClient(client: any) {
  await client.quit();
  console.log("Redis disconnected");
}
