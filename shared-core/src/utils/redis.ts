/**
 * Redis connection management
 */

import { createClient } from "redis";

export async function createRedisClient(redisUrl: string) {
  const client = createClient({
    url: redisUrl,
  });

  client.on("error", (err) => console.log("Redis Client Error", err));

  await client.connect();
  console.log("Redis connected");

  return client;
}

export async function closeRedisClient(client: any) {
  await client.quit();
  console.log("Redis disconnected");
}
