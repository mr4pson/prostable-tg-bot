import { Module } from '@nestjs/common';

import { BeeQueueService } from './bee-queue.service';

/**
 * Модуль, предоставляющий доступ к сервису с настройками Bull
 */
@Module({
  providers: [BeeQueueService],
  exports: [BeeQueueService],
})
export class BeeQueueModule {}
