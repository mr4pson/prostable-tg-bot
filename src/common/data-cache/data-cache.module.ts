import { CacheModule, CacheStore } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { redisStore } from 'cache-manager-redis-yet';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      useFactory: async () => {
        const store = await redisStore({
          socket: {
            host: process.env.REDIS_HOST,
            port: +process.env.REDIS_PORT,
          },
          password: process.env.REDIS_PASS,
          database: 1,
        });

        return {
          store: store as unknown as CacheStore,
          // ttl: 3 * 60000, // 3 minutes (milliseconds)
        };
      },
    }),
  ],
  providers: [],
  exports: [CacheModule],
})
export class DataCacheModule {}
