import { EvmChain } from '@moralisweb3/evm-utils';
import { Injectable } from '@nestjs/common';
import Moralis from 'moralis';

@Injectable()
export class MoralisService {
  constructor() {
    (async () => {
      await Moralis.start({
        apiKey: process.env.MORALIS_API_KEY,
      });
    })();
  }

  async addStream(walletAddress: string, url: string) {
    const response = await Moralis.Streams.add({
      chains: [EvmChain.BSC], // Сеть Ethereum
      tag: 'usdt-transfers',
      description: 'Отслеживание USDT-транзакций',
      includeContractLogs: true,
      webhookUrl: process.env.MORALIS_WEBHOOK_URL + url, // Ваш эндпоинт
      abi: [
        {
          anonymous: false,
          inputs: [
            { indexed: true, name: 'from', type: 'address' },
            { indexed: true, name: 'to', type: 'address' },
            { indexed: false, name: 'value', type: 'uint256' },
          ],
          name: 'Transfer',
          type: 'event',
        },
      ],
      topic0: ['Transfer(address,address,uint256)'],
    });

    return Moralis.Streams.addAddress({
      id: response.result.id,
      address: [walletAddress],
    });
  }

  removeStream(streamId: string) {
    return Moralis.Streams.delete({
      id: streamId,
    });
  }
}
