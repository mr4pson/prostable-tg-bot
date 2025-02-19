import { Injectable } from '@nestjs/common';
import BeeQueue from 'bee-queue';
import { BeeQueues } from './bee-queues.enum';

@Injectable()
export class BeeQueueService {
  public readonly queue: { [key: string]: BeeQueue } = {};
  constructor() {
    const beeQueueConfig = {
      prefix: 'bq',
      redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASS,
        db: 0,
        options: {},
      },
      isWorker: true,
      activateDelayedJobs: true,
      removeOnSuccess: true,
      removeOnFailure: true,
      autoConnect: true,
    };

    this.queue = {
      [BeeQueues.DAILY_CASH_BOX_PULL]: new BeeQueue(
        BeeQueues.DAILY_CASH_BOX_PULL,
        beeQueueConfig,
      ),
    };
  }

  public getQueue(queueName: BeeQueues) {
    return this.queue[queueName];
  }

  public async addJob(
    queue: BeeQueue,
    data: any,
    delay: number,
    jobId?: string,
  ) {
    const date = new Date();
    date.setSeconds(date.getSeconds() + delay / 1000);

    return queue
      .createJob(data)
      .setId(jobId)
      .delayUntil(date)
      .retries(3)
      .save();
  }

  public removeJob(queue: BeeQueue, jobId?: string) {
    return queue.removeJob(jobId);
  }

  public getJob(queue: BeeQueue, jobId: string) {
    return queue.getJob(jobId);
  }
}
