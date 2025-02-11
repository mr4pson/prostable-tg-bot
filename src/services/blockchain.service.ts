import { Injectable } from '@nestjs/common';
import {
  Contract,
  EthersContract,
  EthersSigner,
  hexValue,
  InjectContractProvider,
  InjectSignerProvider,
  parseEther,
  parseUnits,
  Wallet,
} from 'nestjs-ethers';
import { contractAbi, usdtContractAbi } from 'src/common';
import { UserService } from './user.service';

@Injectable()
export class BlockchainService {
  private adminWallet: Wallet;
  private readonly contractService: Contract;

  constructor(
    @InjectContractProvider()
    private readonly ethersContract: EthersContract,
    @InjectSignerProvider()
    private readonly ethersSigner: EthersSigner,
    private readonly userService: UserService,
  ) {
    this.adminWallet = this.ethersSigner.createWallet(
      process.env.WALLET_PRIVATE,
    );

    this.contractService = this.ethersContract.create(
      process.env.CONTRACT_ADDRESS,
      contractAbi,
      this.adminWallet,
    );
    this.listenToEvents();

    (async () => {
      const users = await this.userService.findAllUsers();

      console.log(users);
      users.forEach((user) => {
        this.listenForUserTopup(user.privateKey);
      });
    })();
  }

  generateWallet() {
    const wallet = Wallet.createRandom();

    return {
      publicKey: wallet.address,
      privateKey: wallet.privateKey,
    };
  }

  async sendBNB(toAddress: string, amount: string) {
    const tx = {
      to: toAddress,
      value: parseEther(amount),
      gasLimit: 21000, // Standard gas limit for simple transfers
      gasPrice: await this.adminWallet.getGasPrice(),
    };

    // Send and wait for transaction confirmation
    const txResponse = await this.adminWallet.sendTransaction(tx);
    return await txResponse.wait();
  }

  private listenToEvents() {
    this.contractService.on(
      'Deposit',
      (user: string, amount: BigInt, event: any) => {
        this.handleDepositEvent(user, amount, event);
      },
    );
  }

  public listenForUserTopup(
    clientWallet: string,
    // amount: number,
  ) {
    const userWallet = this.ethersSigner.createWallet(clientWallet);
    const usdtContract: Contract = this.ethersContract.create(
      process.env.USDT_CONTRACT_ADDRESS,
      usdtContractAbi,
      userWallet,
    );

    usdtContract.on(
      'Transfer',
      (from: string, to: string, value: bigint, event) => {
        console.log(from, to, value, event);
      },
    );

    // return this.contractService.create(clientWallet, amount, {
    //   gasPrice: parseUnits('1', 'gwei'),
    //   gasLimit: hexValue(1500000),
    // });
  }

  private handleDepositEvent(user: string, amount: BigInt, event: any) {
    console.log(`New deposit detected:
      - User: ${user}
      - Amount: ${amount.toString()}
      - Transaction hash: ${event.transactionHash}
      - Block number: ${event.blockNumber}
    `);
  }
}
