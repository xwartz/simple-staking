import {
  getAddressBalance,
  getNetworkFees,
  getTipHeight,
  pushTx,
} from "../../mempool_api";
import {
  Fees,
  Network,
  UTXO,
  WalletInfo,
  WalletProvider,
} from "../wallet_provider";

// window object for imToken Wallet
export const imTokenWalletProvider = "bitcoin";

export class imTokenWallet extends WalletProvider {
  private walletInfo: WalletInfo | undefined;
  private provider = window?.[imTokenWalletProvider];
  constructor() {
    super();
  }

  connectWallet = async (): Promise<this> => {
    if (!this.provider) {
      throw new Error("imToken Wallet not found");
    }

    const accounts = await this.provider.request({
      method: "btc_requestAccounts",
    });

    const address = accounts[0];
    const publicKeyHex = await this.provider.request({
      method: "btc_getPublicKey",
    });

    if (!address || !publicKeyHex) {
      throw new Error("Could not connect to imToken Wallet");
    }
    this.walletInfo = {
      publicKeyHex,
      address,
    };
    return this;
  };

  getWalletProviderName = async (): Promise<string> => {
    return "imToken Wallet";
  };

  getAddress = async (): Promise<string> => {
    if (!this.walletInfo) {
      throw new Error("imToken Wallet not connected");
    }
    return this.walletInfo.address;
  };

  getPublicKeyHex = async (): Promise<string> => {
    if (!this.walletInfo) {
      throw new Error("imToken Wallet not connected");
    }
    return this.walletInfo.publicKeyHex;
  };

  signPsbt = async (psbtHex: string): Promise<string> => {
    return await this.provider.request({
      method: "btc_signPsbts",
      params: [[psbtHex]],
    });
  };

  signPsbts = async (psbtsHexes: string[]): Promise<string[]> => {
    if (!psbtsHexes && !Array.isArray(psbtsHexes)) {
      throw new Error("params error");
    }
    return await this.provider.request({
      method: "btc_signPsbts",
      params: [psbtsHexes],
    });
  };

  signMessageBIP322 = async (message: string): Promise<string> => {
    throw new Error("not supported");
  };

  getNetwork = async (): Promise<Network> => {
    return await this.provider.request({
      method: "btc_network",
      params: [],
    });
  };

  on = (eventName: string, callBack: () => void) => {
    if (eventName === "accountChanged") {
      return this.provider?.on("accountsChanged", callBack);
    }
    return this.provider?.on(eventName, callBack);
  };

  getBalance = async (): Promise<number> => {
    return await getAddressBalance(await this.getAddress());
    // return await this.provider.request({
    //   method: "btc_getBalance",
    //   params: [this.walletInfo?.address],
    // });
  };

  getUtxos = async (address: string, amount?: number): Promise<UTXO[]> => {
    return await this.provider.request({
      method: "btc_getUnspent",
      params: [address, amount],
    });
  };

  getNetworkFees = async (): Promise<Fees> => {
    return await getNetworkFees();
  };

  pushTx = async (txHex: string): Promise<string> => {
    return await pushTx(txHex);
  };

  getBTCTipHeight = async (): Promise<number> => {
    return await getTipHeight();
  };
}
