import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { stakingTransaction } from "btc-staking-ts";

import { signPsbtTransaction } from "@/app/common/utils/psbt";
import { FinalityProvider } from "@/app/types/finalityProviders";
import { GlobalParamsVersion } from "@/app/types/globalParams";

import { apiDataToStakingScripts } from "./apiDataToStakingScripts";
import { isTaproot } from "./wallet";
import { WalletProvider } from "./wallet/wallet_provider";

export const signForm = async (
  params: GlobalParamsVersion,
  btcWallet: WalletProvider,
  finalityProvider: FinalityProvider,
  stakingTerm: number,
  btcWalletNetwork: networks.Network,
  stakingAmountSat: number,
  address: string,
  publicKeyNoCoord: string,
): Promise<string> => {
  console.log(">>> params", params);
  console.log(">>> finalityProvider", finalityProvider);
  console.log(">>> stakingTerm", stakingTerm);
  console.log(">>> btcWalletNetwork", btcWalletNetwork);
  console.log(">>> stakingAmountSat", stakingAmountSat);
  console.log(">>> address", address);
  console.log(">>> publicKeyNoCoord", publicKeyNoCoord);

  if (
    !finalityProvider ||
    stakingAmountSat < params.minStakingAmountSat ||
    stakingAmountSat > params.maxStakingAmountSat ||
    stakingTerm < params.minStakingTimeBlocks ||
    stakingTerm > params.maxStakingTimeBlocks
  ) {
    // TODO Show Popup
    throw new Error("Invalid staking data");
  }

  let inputUTXOs = [];
  try {
    inputUTXOs = await btcWallet.getUtxos(address);
  } catch (error: Error | any) {
    throw new Error(error?.message || "UTXOs error");
  }
  if (inputUTXOs.length == 0) {
    throw new Error("Not enough usable balance");
  }

  let scripts;
  try {
    scripts = apiDataToStakingScripts(
      finalityProvider.btcPk,
      stakingTerm,
      params,
      publicKeyNoCoord,
    );
  } catch (error: Error | any) {
    throw new Error(error?.message || "Cannot build staking scripts");
  }
  let feeRate: number;
  try {
    const netWorkFee = await btcWallet.getNetworkFees();
    feeRate = netWorkFee.fastestFee;
    console.log(">>> netWorkFee", netWorkFee);
  } catch (error) {
    throw new Error("Cannot get network fees");
  }
  let unsignedStakingPsbt;
  try {
    const { psbt: stakingPsbt } = stakingTransaction(
      scripts,
      stakingAmountSat,
      address,
      inputUTXOs,
      btcWalletNetwork,
      feeRate,
      isTaproot(address) ? Buffer.from(publicKeyNoCoord, "hex") : undefined,
      // `lockHeight` is exclusive of the provided value.
      // For example, if a Bitcoin height of X is provided,
      // the transaction will be included starting from height X+1.
      // https://learnmeabitcoin.com/technical/transaction/locktime/
      params.activationHeight - 1,
    );
    // stakingPsbt.setVersion(0);
    unsignedStakingPsbt = stakingPsbt;
    // console.log(">>> psbt", psbt);
    const psbtHex = stakingPsbt.toHex();
    console.log(">>> psbtHex", psbtHex);
    const psbt = Psbt.fromHex(psbtHex);
    console.log(">>> psbt", psbt);
    const psbtBase64 = psbt.toBase64();
    console.log(">>> psbtBase64", psbtBase64);
    const unSignedTx = Transaction.fromBuffer(psbt.data.getTransaction());
    const txId = unSignedTx.getId();
    const vsize = unSignedTx.virtualSize();
    const version = psbt.version;
  } catch (error: Error | any) {
    throw new Error(
      error?.message || "Cannot build unsigned staking transaction",
    );
  }
  let stakingTx: Transaction;
  try {
    stakingTx = await signPsbtTransaction(btcWallet)(
      unsignedStakingPsbt.toHex(),
    );
  } catch (error: Error | any) {
    throw new Error(error?.message || "Staking transaction signing PSBT error");
  }

  return stakingTx.toHex();
};
