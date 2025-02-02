import { Injectable } from '@nestjs/common';
import Web3 from 'web3';

@Injectable()
export class BlockchainService {
  private web3: Web3;
  private botAddress: string;
  private botPrivateKey: string;

  constructor() {
    this.web3 = new Web3(process.env.BSC_NODE_URL);
    this.botAddress = process.env.BOT_WALLET_ADDRESS ?? '';
    this.botPrivateKey = process.env.BOT_WALLET_PRIVATE_KEY ?? '';
  }

  generateWallet() {
    const account = this.web3.eth.accounts.create();
    return {
      publicKey: account.address,
      privateKey: account.privateKey,
    };
  }

  async sendBNB(toAddress: string, amount: string) {
    const tx = {
      from: this.botAddress,
      to: toAddress,
      value: this.web3.utils.toWei(amount, 'ether'),
      gas: 21000,
      gasPrice: await this.web3.eth.getGasPrice(),
    };

    const signedTx = await this.web3.eth.accounts.signTransaction(
      tx,
      this.botPrivateKey,
    );
    return this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
  }
}
