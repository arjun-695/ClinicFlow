package db

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	RedisClient    *redis.Client
	IsRedisEnabled bool
	redisMutex     sync.RWMutex
)

// InitRedis parses the REDIS_URL and connects to the Redis service
func InitRedis() {
	redisMutex.Lock()
	defer redisMutex.Unlock()

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		// Fallback for simplehost:port formats
		opts = &redis.Options{
			Addr: redisURL,
		}
	}

	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, err = client.Ping(ctx).Result()
	if err != nil {
		log.Printf("WARNING: Failed to connect to Redis at %s: %v. Caching is disabled and queries will fallback directly to the database.", redisURL, err)
		IsRedisEnabled = false
		client.Close()
		return
	}

	log.Printf("Successfully connected to Redis at %s! Caching layer is active.", redisURL)
	RedisClient = client
	IsRedisEnabled = true
}

// GetCache fetches and deserializes the JSON cached value into the destination struct
func GetCache(ctx context.Context, key string, dest interface{}) bool {
	redisMutex.RLock()
	enabled := IsRedisEnabled
	client := RedisClient
	redisMutex.RUnlock()

	if !enabled || client == nil {
		return false
	}

	val, err := client.Get(ctx, key).Result()
	if err != nil {
		if err != redis.Nil {
			log.Printf("Redis Get error for key %s: %v", key, err)
		}
		return false
	}

	err = json.Unmarshal([]byte(val), dest)
	if err != nil {
		log.Printf("Redis Unmarshal error for key %s: %v", key, err)
		return false
	}

	return true
}

// SetCache serializes and saves the value in Redis with a Time To Live (TTL)
func SetCache(ctx context.Context, key string, value interface{}, ttl time.Duration) bool {
	redisMutex.RLock()
	enabled := IsRedisEnabled
	client := RedisClient
	redisMutex.RUnlock()

	if !enabled || client == nil {
		return false
	}

	data, err := json.Marshal(value)
	if err != nil {
		log.Printf("Redis Marshal error for key %s: %v", key, err)
		return false
	}

	err = client.Set(ctx, key, string(data), ttl).Err()
	if err != nil {
		log.Printf("Redis Set error for key %s: %v", key, err)
		return false
	}

	return true
}

// InvalidateCache deletes exact key(s) or scan-deletes keys matching a wildcard pattern
func InvalidateCache(ctx context.Context, keyPattern string) bool {
	redisMutex.RLock()
	enabled := IsRedisEnabled
	client := RedisClient
	redisMutex.RUnlock()

	if !enabled || client == nil {
		return false
	}

	// If it's a direct exact key, delete it immediately
	if !strings.Contains(keyPattern, "*") {
		err := client.Del(ctx, keyPattern).Err()
		if err != nil {
			log.Printf("Redis Del error for key %s: %v", keyPattern, err)
			return false
		}
		return true
	}

	// Otherwise, scan keys iteratively to avoid blocking Redis single-threaded process
	var cursor uint64
	for {
		var keys []string
		var err error
		keys, cursor, err = client.Scan(ctx, cursor, keyPattern, 100).Result()
		if err != nil {
			log.Printf("Redis Scan error for pattern %s: %v", keyPattern, err)
			return false
		}

		if len(keys) > 0 {
			err = client.Del(ctx, keys...).Err()
			if err != nil {
				log.Printf("Redis Del keys failed for pattern %s: %v", keyPattern, err)
				return false
			}
		}

		if cursor == 0 {
			break
		}
	}

	return true
}
