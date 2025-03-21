import { Injectable } from '@nestjs/common';
import {
  Contract,
  EthersContract,
  EthersSigner,
  formatUnits,
  getAddress,
  InjectContractProvider,
  InjectSignerProvider,
  parseEther,
  parseUnits,
  Wallet,
} from 'nestjs-ethers';
import { contractAbi, usdtContractAbi } from 'src/common';
import { UserDocument } from 'src/schemas';

export const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

@Injectable()
export class BlockchainService {
  private adminWallet: Wallet;
  private readonly contractService: Contract;

  constructor(
    @InjectContractProvider()
    private readonly ethersContract: EthersContract,
    @InjectSignerProvider()
    private readonly ethersSigner: EthersSigner,
  ) {
    this.adminWallet = this.ethersSigner.createWallet(
      process.env.WALLET_PRIVATE,
    );

    this.contractService = this.ethersContract.create(
      process.env.CONTRACT_ADDRESS,
      contractAbi,
      this.adminWallet,
    );
  }

  generateWallet() {
    const wallet = Wallet.createRandom();

    return {
      publicKey: wallet.address,
      privateKey: wallet.privateKey,
    };
  }

  isEip55Address(address) {
    try {
      const checksumAddress = getAddress(address);

      return checksumAddress === address;
    } catch (error) {
      return false;
    }
  }

  async sendBNB(toAddress: string) {
    const adminWallet = this.ethersSigner.createWallet(
      process.env.SEND_BNB_WALLET_PRIVATE,
    );

    const tx = {
      to: toAddress,
      value: parseEther('0.0015'),
      // gasLimit: 21000, // Standard gas limit for simple transfers
      gasPrice: await adminWallet.getGasPrice(),
      // gasLimit: hexValue(150000000), // Standard gas limit for simple transfers
      // gasPrice: parseUnits('1', 'gwei'),
    };

    // Send and wait for transaction confirmation
    const txResponse = await adminWallet.sendTransaction(tx);
    return await txResponse.wait();
  }

  public async handleApprove(privateKey: string, amount: number) {
    try {
      const userWallet = this.ethersSigner.createWallet(privateKey);
      const usdtContract = this.ethersContract.create(
        process.env.USDT_CONTRACT_ADDRESS,
        usdtContractAbi,
        userWallet,
      );

      const balanceBN = await usdtContract.balanceOf(userWallet.address);
      const balanceDecimal = parseInt(formatUnits(balanceBN, 18));

      if (balanceDecimal < amount) {
        console.log('Insufficient balance in wallet');

        return false;
      }

      const trx = usdtContract.approve(
        process.env.CONTRACT_ADDRESS,
        parseUnits(amount.toString(), 18),
        {
          gasPrice: await userWallet.getGasPrice(),
        },
      );

      return trx;
    } catch (e) {
      console.log(e, new Date());
      return undefined;
    }
  }

  public async handleDeposit(privateKey: string, amount: number): Promise<any> {
    try {
      const trx = await this.handleApprove(privateKey, amount);

      if (!trx) {
        console.log('Handle approve failed');
        return false;
      }

      await trx?.wait();
      console.log(trx);

      const userWallet = this.ethersSigner.createWallet(privateKey);
      const contract = this.ethersContract.create(
        process.env.CONTRACT_ADDRESS,
        contractAbi,
        userWallet,
      );

      return contract.deposit(parseUnits(amount.toString(), 18));
    } catch (error) {
      console.log(error, new Date());
      return false;
    }
  }

  public async handleSendTransfer(
    senderPrivateKey: string,
    receiverPublicKey: string,
    amount: number,
  ): Promise<any> {
    try {
      const userWallet = this.ethersSigner.createWallet(senderPrivateKey);
      const usdtContract = this.ethersContract.create(
        process.env.USDT_CONTRACT_ADDRESS,
        usdtContractAbi,
        userWallet,
      );

      const trx = await usdtContract.transfer(
        receiverPublicKey,
        parseUnits(amount.toString(), 18),
      );

      if (!trx) {
        console.log('Handle transfer failed');
        return false;
      }

      await trx?.wait();
      console.log(trx);

      return trx;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  public async handleWithdraw(
    user: UserDocument,
    receiverPublicKey: string,
    amount: number,
  ): Promise<any> {
    try {
      const adminWallet = this.ethersSigner.createWallet(
        process.env.SEND_BNB_WALLET_PRIVATE,
      );
      const contract = this.ethersContract.create(
        process.env.CONTRACT_ADDRESS,
        contractAbi,
        adminWallet,
      );

      const trx = await contract.withdrawByAdmin(
        user.publicKey,
        parseUnits(amount.toString(), 18),
      );

      if (!trx) {
        console.log('Handle withdraw failed');
        return false;
      }

      await trx?.wait();
      console.log('withdraw trx=', trx);

      return this.handleSendTransfer(
        user.privateKey,
        receiverPublicKey,
        amount,
      );
    } catch (error) {
      console.log(error);
      return false;
    }
  }
}
