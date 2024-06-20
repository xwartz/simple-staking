import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { stakingTransaction } from "btc-staking-ts";

import { signPsbtTransaction } from "@/app/common/utils/psbt";
import { FinalityProvider } from "@/app/types/finalityProviders";
import { GlobalParamsVersion } from "@/app/types/globalParams";

import { apiDataToStakingScripts } from "./apiDataToStakingScripts";
import { decodePsbt } from "./mempool_api";
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
    inputUTXOs = await btcWallet.getUtxos(address, stakingAmountSat);
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
    console.log(">>> staking psbt", stakingPsbt);
    const psbtHex = stakingPsbt.toHex();
    console.log(">>> staking psbtHex", psbtHex);
    const psbt = Psbt.fromHex(psbtHex);
    const psbtBase64 = psbt.toBase64();
    console.log(">>> staking psbtBase64", psbtBase64);
    const unSignedTx = Transaction.fromBuffer(psbt.data.getTransaction());
    const txId = unSignedTx.getId();
    console.log(">>> staking txId", txId);
    const vsize = unSignedTx.virtualSize();
    console.log(">>> staking vsize", vsize);
    const version = psbt.version;
    console.log(">>> staking version", version);
    const decodeTx = await decodePsbt(psbtBase64);
    console.log(">>> staking decodeTx", decodeTx.result);
    console.log(
      ">>> staking decodeTx stringify",
      JSON.stringify(decodeTx.result, null, 2),
    );
  } catch (error: Error | any) {
    console.log(">>> staking decodeTx error", error);
    throw new Error(
      error?.message || "Cannot build unsigned staking transaction",
    );
  }
  let stakingTx: Transaction;
  try {
    stakingTx = await signPsbtTransaction(btcWallet)(
      unsignedStakingPsbt.toHex(),
    );
    console.log(">>> staking signedTx", stakingTx);
    console.log(">>> staking signedTx toHex", stakingTx.toHex());
    const signature = stakingTx.ins[0].witness[0].toString("hex");
    console.log(">>> staking signature", signature);
  } catch (error: Error | any) {
    console.log(">>> staking error", error);
    throw new Error(error?.message || "Staking transaction signing PSBT error");
  }

  return stakingTx.toHex();
};
