import { randomUUID } from "node:crypto";
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { gzipSync } from "node:zlib";

import { GfsService } from "./gfs.service.js";
import { encodeGfsTile } from "./gfs-tiles.js";
import { GfsRedisCacheService, gfsRunId } from "./gfs-redis-cache.service.js";

type PrefetchTask = { x: number; y: number; forecastHour: number };

const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 40_000];

@Injectable()
export class GfsPrefetchService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger("GFS Prefetch");
  private readonly enabled: boolean;
  private readonly concurrency: number;
  private readonly refreshIntervalMs: number;
  private readonly lockTtlMs: number;
  private readonly maxEstimatedRedisBytes: number;
  private readonly forecastHours: number[];
  private timer?: NodeJS.Timeout;
  private lockRenewal: NodeJS.Timeout | undefined;
  private running = false;
  private stopping = false;
  private estimatedRun?: string;
  private estimatedRunBytes?: number;

  constructor(
    private readonly config: ConfigService,
    private readonly gfs: GfsService,
    private readonly redis: GfsRedisCacheService,
  ) {
    this.enabled = config.get<boolean>("GFS_PREFETCH_ENABLED", true) !== false;
    this.concurrency = this.int(config.get<number>("GFS_PREFETCH_CONCURRENCY", 6), 6, 1, 16);
    this.refreshIntervalMs = this.int(
      config.get<number>("GFS_PREFETCH_REFRESH_INTERVAL_MS", 900_000),
      900_000,
      10_000,
      Number.MAX_SAFE_INTEGER,
    );
    this.lockTtlMs = this.int(
      config.get<number>("GFS_PREFETCH_LOCK_TTL_MS", 120_000),
      120_000,
      10_000,
      Number.MAX_SAFE_INTEGER,
    );
    this.maxEstimatedRedisBytes = this.int(
      config.get<number>(
        "GFS_PREFETCH_MAX_ESTIMATED_REDIS_BYTES",
        512 * 1024 * 1024,
      ),
      512 * 1024 * 1024,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    this.forecastHours = this.parseForecastHours(
      config.get<string>("GFS_PREFETCH_FORECAST_HOURS", "0,3,6,9,12,18,24,36,48,72"),
    );
  }

  onApplicationBootstrap() {
    if (!this.enabled) {
      this.logger.log("disabled by GFS_PREFETCH_ENABLED");
      return;
    }
    // Never block API boot on global population.
    setTimeout(() => void this.runCycle(), 0).unref();
    this.timer = setInterval(() => void this.runCycle(), this.refreshIntervalMs);
    this.timer.unref();
  }

  private async runCycle() {
    if (this.stopping || this.running) return;
    this.running = true;
    const token = randomUUID();
    const startedAt = Date.now();
    let locked = false;
    try {
      locked = await this.redis.acquireLock(token, this.lockTtlMs);
      if (!locked) {
        this.logger.log("lock busy or Redis unavailable; API fallback remains active");
        return;
      }
      this.lockRenewal = setInterval(
        () => void this.redis.renewLock(token, this.lockTtlMs),
        Math.max(5_000, Math.floor(this.lockTtlMs / 3)),
      );
      this.lockRenewal.unref();

      const inventory = await this.gfs.getCompleteInventory(this.forecastHours);
      const run = gfsRunId(inventory.run.runAt);
      const tasks = this.tasks();
      const estimatedRedisBytes = await this.estimateRedisBytes(
        inventory,
        tasks.length,
      );
      if (estimatedRedisBytes > this.maxEstimatedRedisBytes) {
        this.logger.warn(
          `run=${run} prefetch aborted: estimatedRedisBytes=${estimatedRedisBytes} exceeds max=${this.maxEstimatedRedisBytes}`,
        );
        return;
      }
      let cached = 0;
      let missing = 0;
      let failed = 0;
      let retries = 0;
      let bytes = 0;
      let next = 0;
      const processTask = async () => {
        while (!this.stopping) {
          const index = next++;
          const task = tasks[index];
          if (!task) return;
          const existing = await this.redis.getTile(run, task.forecastHour, task.x, task.y);
          if (existing) {
            cached += 1;
            bytes += existing.byteLength;
            continue;
          }
          missing += 1;
          let stored = false;
          for (let attempt = 0; attempt < RETRY_DELAYS_MS.length && !this.stopping; attempt += 1) {
            try {
              const grid = await this.gfs.getTileFromInventory(
                inventory,
                task.x,
                task.y,
                task.forecastHour,
              );
              const body = gzipSync(encodeGfsTile(grid));
              if (await this.redis.setTile(run, task.forecastHour, task.x, task.y, body)) {
                stored = true;
                bytes += body.byteLength;
                retries += attempt;
                break;
              }
            } catch (error) {
              retries += 1;
              if (attempt + 1 < RETRY_DELAYS_MS.length) {
                await this.delayWithJitter(RETRY_DELAYS_MS[attempt]!);
              } else {
                this.logger.warn(
                  `tile failed run=${run} f=${task.forecastHour} x=${task.x} y=${task.y}: ${this.message(error)}`,
                );
              }
            }
          }
          if (!stored) failed += 1;
          if ((cached + missing) % 100 === 0) {
            this.logger.log(
              `run=${run} progress=${cached + missing}/${tasks.length} cached=${cached} missing=${missing} failed=${failed} retries=${retries} concurrency=${this.concurrency}`,
            );
          }
        }
      };
      await Promise.all(Array.from({ length: this.concurrency }, () => processTask()));

      if (!this.stopping && failed === 0 && cached + missing === tasks.length) {
        await this.redis.publishActiveRun(run);
        this.logger.log(`run=${run} READY active-run published`);
      } else {
        this.logger.warn(`run=${run} incomplete; active-run was not changed`);
      }
      const stats = this.redis.stats();
      this.logger.log(
        `run=${run} progress=${cached + missing}/${tasks.length} cached=${cached} missing=${missing} failed=${failed} retries=${retries} bytes=${bytes} durationMs=${Date.now() - startedAt} redisHits=${stats.redisHits} redisMisses=${stats.redisMisses}`,
      );
    } catch (error) {
      this.logger.warn(`cycle failed: ${this.message(error)}`);
    } finally {
      if (this.lockRenewal) clearInterval(this.lockRenewal);
      this.lockRenewal = undefined;
      if (locked) await this.redis.releaseLock(token);
      this.running = false;
    }
  }

  private tasks(): PrefetchTask[] {
    const tasks: PrefetchTask[] = [];
    for (const forecastHour of this.forecastHours) {
      for (let y = 0; y < 18; y += 1) {
        for (let x = 0; x < 36; x += 1) tasks.push({ x, y, forecastHour });
      }
    }
    return tasks;
  }

  private async estimateRedisBytes(
    inventory: Awaited<ReturnType<GfsService["getCompleteInventory"]>>,
    taskCount: number,
  ) {
    if (taskCount === 0) return 0;
    const run = gfsRunId(inventory.run.runAt);
    if (this.estimatedRun === run && this.estimatedRunBytes !== undefined) {
      return this.estimatedRunBytes;
    }
    const samples: number[] = [];
    for (const forecastHour of this.forecastHours) {
      try {
        const grid = await this.gfs.getTileFromInventory(
          inventory,
          18,
          9,
          forecastHour,
        );
        samples.push(gzipSync(encodeGfsTile(grid)).byteLength);
      } catch (error) {
        this.logger.warn(
          `prefetch size sample failed f=${forecastHour}: ${this.message(error)}`,
        );
      }
    }
    if (samples.length === 0) return Number.POSITIVE_INFINITY;
    const average =
      samples.reduce((sum, value) => sum + value, 0) / samples.length;
    // Include a conservative allowance for Redis key/value/object overhead.
    const estimate = Math.ceil(average * taskCount * 1.25);
    this.estimatedRun = run;
    this.estimatedRunBytes = estimate;
    this.logger.log(
      `run=${run} estimatedRedisBytes=${estimate} sampleAverageBytes=${Math.ceil(average)}`,
    );
    return estimate;
  }

  private parseForecastHours(value: string) {
    const hours = value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 384);
    return [...new Set(hours)].sort((a, b) => a - b);
  }

  private async delayWithJitter(baseMs: number) {
    const jitter = baseMs * (0.8 + Math.random() * 0.4);
    await new Promise((resolve) => setTimeout(resolve, jitter));
  }

  private int(value: number | undefined, fallback: number, min: number, max: number) {
    return Number.isInteger(value) && value !== undefined && value >= min && value <= max
      ? value
      : fallback;
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    if (this.lockRenewal) clearInterval(this.lockRenewal);
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
