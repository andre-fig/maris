import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { ENC_QUEUE, ProcessingDispatcherService } from './processing-dispatcher.service.js';
import type { ProcessingJob } from '../models/processing.js';

const job = (id: string): ProcessingJob => ({ ingestionId: id, versionId: id, versionKey: id, archivePath: `${id}.zip` });
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 15000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Queue test timed out');
    await delay(50);
  }
}

test('real Redis: serial processing, deduplication, retries, and pending jobs survive consumer restart',
  { skip: !process.env.REDIS_TEST_URL }, async () => {
    const url = new URL(process.env.REDIS_TEST_URL!);
    const prefix = `test-${randomUUID()}`;
    const queue = new Queue<ProcessingJob>(ENC_QUEUE, { prefix, connection: {
      host: url.hostname, port: Number(url.port || 6379), username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password), maxRetriesPerRequest: 1,
    } });
    const calls: string[] = [];
    let active = 0;
    let maximum = 0;
    let retryCount = 0;
    const config = new ConfigService({ REDIS_URL: process.env.REDIS_TEST_URL, ENC_QUEUE_PREFIX: prefix });
    const create = () => new ProcessingDispatcherService({ listRecoverableJobs: async () => [] } as never, {
      run: async (value: ProcessingJob, propagate: boolean) => {
        assert.equal(propagate, true);
        active++;
        maximum = Math.max(maximum, active);
        try {
          calls.push(value.ingestionId);
          await delay(30);
          if (value.ingestionId === 'retry' && retryCount++ === 0) throw new Error('transient');
        } finally { active--; }
      },
    } as never, { recoverOrphans: async () => undefined } as never, config);
    let dispatcher = create();
    try {
      await dispatcher.onApplicationBootstrap();
      await queue.pause();
      await dispatcher.dispatch(job('one'));
      await dispatcher.dispatch(job('one'));
      await dispatcher.dispatch(job('two'));
      assert.ok(await queue.getJob('one'));
      assert.ok(await queue.getJob('two'));
      assert.deepEqual(calls, []);
      await dispatcher.onApplicationShutdown();
      dispatcher = create();
      await dispatcher.onApplicationBootstrap();
      await queue.resume();
      await until(async () => await queue.getCompletedCount() === 2);
      assert.deepEqual(calls, ['one', 'two']);
      assert.equal(maximum, 1);
      await queue.add('import-enc', job('retry'), { jobId: 'retry', attempts: 2, backoff: { type: 'fixed', delay: 50 } });
      await until(async () => await queue.getCompletedCount() === 3);
      assert.equal(retryCount, 2);
    } finally {
      await dispatcher.onApplicationShutdown();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
