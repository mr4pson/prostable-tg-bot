import { Injectable, OnModuleInit } from '@nestjs/common';
import { Transaction, TransactionReceipt, Web3 } from 'web3';
import { UserService } from './user.service';
import { BlockchainService } from './blockchain.service';

@Injectable()
export class TransactionListener implements OnModuleInit {
  private web3: Web3;

  constructor(
    private userService: UserService,
    private blockchainService: BlockchainService,
  ) {
    this.web3 = new Web3(process.env.BSC_NODE_URL);
  }

  async onModuleInit() {
    this.monitorTransactions();
  }
  private async monitorTransactions() {
    const subscription = await this.web3.eth.subscribe('newBlockHeaders');

    subscription.on('data', async (blockHeader) => {
      try {
        const block = await this.web3.eth.getBlock(blockHeader.hash, true);

        for (const txHash of block.transactions) {
          // Получаем полные данные транзакции
          const tx = await this.web3.eth.getTransaction(txHash.toString());

          // Получаем receipt для проверки успешности
          const receipt = await this.web3.eth.getTransactionReceipt(
            txHash.toString(),
          );

          if (tx && receipt?.status) {
            // Для нативных переводов BNB
            if (tx.to && Number(tx.value) > 0) {
              await this.processNativeTransfer(tx);
            }

            // Для переводов токенов USDT (BEP-20)
            if (receipt.logs && receipt.logs.length > 0) {
              await this.processTokenTransfers(receipt);
            }
          }
        }
      } catch (error) {
        console.error('Error processing block:', error);
      }
    });
  }

  private async processNativeTransfer(tx: Transaction) {
    const user = await this.userService.findByPublicKey(
      tx.to?.toLowerCase() ?? '',
    );
    if (!user || user.hasFundedWallet) return;

    const amount = Number(this.web3.utils.fromWei(Number(tx.value), 'ether'));

    await this.blockchainService.sendBNB(user.publicKey, '0.0015');
    await this.userService.updateUser(user.tgUserId, {
      hasFundedWallet: true,
      walletBalance: amount,
    });
  }

  private async processTokenTransfers(receipt: TransactionReceipt) {
    const usdtContractAddress = '0x55d398326f99059fF775485246999027B3197955'; // USDT на BSC
    const transferEventHash = this.web3.utils.keccak256(
      'Transfer(address,address,uint256)',
    );

    for (const log of receipt.logs) {
      if (
        log.address?.toLowerCase() === usdtContractAddress.toLowerCase() &&
        log.topics &&
        log.topics[0].toString() === transferEventHash
      ) {
        const decoded: any = this.web3.eth.abi.decodeLog(
          [
            { type: 'address', name: 'from', indexed: true },
            { type: 'address', name: 'to', indexed: true },
            { type: 'uint256', name: 'value', indexed: false },
          ],
          log.data as any,
          log.topics.slice(1) as any,
        );

        const user = await this.userService.findByPublicKey(
          decoded.to.toLowerCase(),
        );
        if (user) {
          const amount = Number(
            this.web3.utils.fromWei(decoded.value, 'ether'),
          );
          await this.userService.updateUser(user.tgUserId, {
            walletBalance: user.walletBalance + amount,
          });
        }
      }
    }
  }
}
